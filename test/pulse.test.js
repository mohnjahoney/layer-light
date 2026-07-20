import test from 'node:test'
import assert from 'node:assert/strict'
import { solveShortwave } from '../src/physics.js'
import { solvePulseSequence } from '../src/pulse.js'

const layer = (id, overrides = {}) => ({
  id,
  enabled: true,
  thickness: 1000,
  transmittance: 0.6,
  reflectance: 0.3,
  absorptance: 0.1,
  ...overrides,
})

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`)
}

test('a finite pulse splits into transmitted, reflected, and absorbed outcomes', () => {
  const result = solvePulseSequence([layer('glass')], 100, {
    propagationSpeed: 1,
    energyThreshold: 0,
  })

  assert.equal(result.splitEvents.length, 1)
  assert.equal(result.pulses.length, 3)
  assert.deepEqual(
    {
      time: result.splitEvents[0].time,
      direction: result.splitEvents[0].incidentDirection,
      transmitted: result.splitEvents[0].transmittedEnergy,
      reflected: result.splitEvents[0].reflectedEnergy,
      absorbed: result.splitEvents[0].absorbedEnergy,
    },
    { time: 0.5, direction: 'inward', transmitted: 60, reflected: 30, absorbed: 10 },
  )
  closeTo(result.totals.enteredRoomEnergy, 60)
  closeTo(result.totals.escapedOutdoorsEnergy, 30)
  closeTo(result.totals.absorbedEnergy, 10)
  closeTo(result.totals.conservationResidual, 0)
  assert.deepEqual(
    Object.fromEntries(result.boundaryArrivals.map(({ boundary, time }) => [boundary, time])),
    { outdoors: 1, room: 1 },
  )
})

test('reflected descendants preserve direction, ancestry, and event time', () => {
  const result = solvePulseSequence([
    layer('outer', { transmittance: 0.5, reflectance: 0.5, absorptance: 0 }),
    layer('inner', { transmittance: 0.5, reflectance: 0.5, absorptance: 0 }),
  ], 100, {
    propagationSpeed: 1,
    energyThreshold: 13,
  })

  assert.deepEqual(
    result.splitEvents.map(({ layerId, time, incidentDirection, incidentEnergy }) => ({
      layerId,
      time,
      incidentDirection,
      incidentEnergy,
    })),
    [
      { layerId: 'outer', time: 0.5, incidentDirection: 'inward', incidentEnergy: 100 },
      { layerId: 'inner', time: 1.5, incidentDirection: 'inward', incidentEnergy: 50 },
      { layerId: 'outer', time: 2.5, incidentDirection: 'outward', incidentEnergy: 25 },
    ],
  )

  const secondSplit = result.splitEvents[1]
  const thirdIncident = result.pulses.find((pulse) => pulse.id === result.splitEvents[2].pulseId)
  assert.equal(thirdIncident.id, secondSplit.reflectedPulseId)
  assert.equal(thirdIncident.parentId, secondSplit.pulseId)
  assert.equal(thirdIncident.direction, 'outward')
  closeTo(result.totals.enteredRoomEnergy, 25)
  closeTo(result.totals.escapedOutdoorsEnergy, 62.5)
  closeTo(result.totals.unresolvedEnergy, 12.5)
  closeTo(result.totals.conservationResidual, 0)
})

test('disabled layers are absent from pulse geometry and timing', () => {
  const result = solvePulseSequence([
    layer('active'),
    layer('disabled', { enabled: false, thickness: 100_000 }),
  ], 100, {
    propagationSpeed: 1,
    energyThreshold: 0,
  })

  assert.deepEqual(result.activeLayerIds, ['active'])
  assert.equal(result.geometry.layerLocations.length, 1)
  closeTo(result.splitEvents[0].time, 0.5)
  closeTo(result.boundaryArrivals.find(({ boundary }) => boundary === 'room').time, 1)
})

test('a time horizon retains not-yet-expanded energy as unresolved', () => {
  const result = solvePulseSequence([layer('glass')], 100, {
    propagationSpeed: 1,
    timeHorizon: 0.25,
  })

  assert.equal(result.splitEvents.length, 0)
  assert.equal(result.pulses[0].status, 'unresolved')
  assert.equal(result.pulses[0].unresolvedReason, 'time-horizon')
  closeTo(result.totals.unresolvedEnergy, 100)
  closeTo(result.totals.conservationResidual, 0)
})

test('a time horizon also retains pulses that have split but not reached a boundary', () => {
  const result = solvePulseSequence([layer('glass')], 100, {
    propagationSpeed: 1,
    timeHorizon: 0.75,
    energyThreshold: 0,
  })

  assert.equal(result.splitEvents.length, 1)
  assert.equal(result.boundaryArrivals.length, 0)
  closeTo(result.totals.absorbedEnergy, 10)
  closeTo(result.totals.unresolvedEnergy, 90)
  closeTo(result.totals.conservationResidual, 0)
})

test('the event limit safely terminates expansion without losing energy', () => {
  const result = solvePulseSequence([
    layer('outer', { transmittance: 0.5, reflectance: 0.5, absorptance: 0 }),
    layer('inner', { transmittance: 0.5, reflectance: 0.5, absorptance: 0 }),
  ], 100, {
    propagationSpeed: 1,
    energyThreshold: 0,
    maxEvents: 3,
  })

  assert.equal(result.splitEvents.length, 3)
  assert.ok(result.pulses.some((pulse) => pulse.unresolvedReason === 'event-limit'))
  assert.ok(result.totals.unresolvedEnergy > 0)
  closeTo(result.totals.conservationResidual, 0)
})

test('pulse outcomes converge to the analytical steady-state solution', () => {
  const layers = [layer('outer'), layer('inner')]
  const energy = 1000
  const pulse = solvePulseSequence(layers, energy, { energyThreshold: 1e-10 })
  const steady = solveShortwave(layers, energy)

  closeTo(pulse.totals.enteredRoomEnergy, steady.boundaries.room.enteringInwardFlux, 1e-8)
  closeTo(pulse.totals.escapedOutdoorsEnergy, steady.boundaries.outdoors.escapingOutwardFlux, 1e-8)
  closeTo(pulse.totals.absorbedEnergy, steady.totals.absorbedFlux, 1e-8)
  assert.ok(pulse.totals.unresolvedEnergy <= 1e-10)
  closeTo(pulse.totals.conservationResidual, 0, 1e-8)
})

test('an empty stack carries the complete pulse directly into the room', () => {
  const result = solvePulseSequence([], 75)

  assert.equal(result.splitEvents.length, 0)
  assert.equal(result.pulses.length, 1)
  assert.equal(result.pulses[0].status, 'escaped')
  closeTo(result.totals.enteredRoomEnergy, 75)
  closeTo(result.totals.conservationResidual, 0)
})
