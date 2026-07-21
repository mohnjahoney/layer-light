import test from 'node:test'
import assert from 'node:assert/strict'
import { solvePulseSequence } from '../src/pulse.js'
import { createPulseViewModel } from '../src/pulseViewModel.js'

const layer = (id, transmittance, reflectance, absorptance) => ({
  id,
  enabled: true,
  thickness: 4,
  transmittance,
  reflectance,
  absorptance,
})

const closeTo = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`)
}

test('pulse bands retain top-reflected, middle-transmitted, bottom-absorbed altitude', () => {
  const sequence = solvePulseSequence([
    layer('outer', 0.7, 0.2, 0.1),
    layer('inner', 0.8, 0.1, 0.1),
  ], 100, { energyThreshold: 0.01 })
  const view = createPulseViewModel(sequence)
  const firstSplit = sequence.splitEvents[0]
  const reflected = view.pulseBands.find((pulse) => pulse.id === firstSplit.reflectedPulseId)
  const transmitted = view.pulseBands.find((pulse) => pulse.id === firstSplit.transmittedPulseId)
  const absorbed = view.absorptionBands.find((band) => band.absorptionEventId === firstSplit.absorptionEventId)

  closeTo(reflected.yStart, 0)
  closeTo(reflected.yEnd, 0.2)
  closeTo(transmitted.yStart, 0.2)
  closeTo(transmitted.yEnd, 0.9)
  closeTo(absorbed.yStart, 0.9)
  closeTo(absorbed.yEnd, 1)

  const secondSplit = sequence.splitEvents.find((event) => event.pulseId === transmitted.id)
  const secondReflection = view.pulseBands.find((pulse) => pulse.id === secondSplit.reflectedPulseId)
  const secondTransmission = view.pulseBands.find((pulse) => pulse.id === secondSplit.transmittedPulseId)
  const secondAbsorption = view.absorptionBands.find((band) => band.absorptionEventId === secondSplit.absorptionEventId)

  closeTo(secondReflection.yStart, 0.2)
  closeTo(secondReflection.yEnd, 0.27)
  closeTo(secondTransmission.yStart, 0.27)
  closeTo(secondTransmission.yEnd, 0.83)
  closeTo(secondAbsorption.yStart, 0.83)
  closeTo(secondAbsorption.yEnd, 0.9)
})

test('ungrouped traveling bands never overlap within a playback generation', () => {
  const sequence = solvePulseSequence([
    layer('outer', 0.6, 0.3, 0.1),
    layer('middle', 0.55, 0.35, 0.1),
    layer('inner', 0.5, 0.4, 0.1),
  ], 1000, { energyThreshold: 0.1 })
  const { pulseBands } = createPulseViewModel(sequence)
  const generations = new Map()

  for (const pulse of pulseBands) {
    const bands = generations.get(pulse.generation) ?? []
    bands.push(pulse)
    generations.set(pulse.generation, bands)
  }

  for (const bands of generations.values()) {
    bands.sort((a, b) => a.yStart - b.yStart)
    for (let index = 1; index < bands.length; index += 1) {
      assert.ok(
        bands[index - 1].yEnd <= bands[index].yStart + 1e-12,
        `${bands[index - 1].id} overlapped ${bands[index].id}`,
      )
    }
  }
})

test('each absorption band is assigned to its layer target and arrival time', () => {
  const sequence = solvePulseSequence([layer('glass', 0.6, 0.3, 0.1)], 100)
  const view = createPulseViewModel(sequence)

  assert.equal(view.absorptionBands.length, 1)
  assert.equal(view.absorptionBands[0].layerId, 'glass')
  assert.equal(view.absorptionBands[0].energy, 10)
  assert.ok(view.absorptionBands[0].displayEnd > view.absorptionBands[0].displayStart)
  assert.ok(view.duration >= view.absorptionBands[0].displayEnd)
})
