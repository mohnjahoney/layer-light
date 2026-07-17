import test from 'node:test'
import assert from 'node:assert/strict'
import { solveShortwave, solveSystem } from '../src/physics.js'

const layer = (overrides = {}) => ({
  id: crypto.randomUUID(),
  kind: 'solid',
  thickness: 4,
  conductivity: 1,
  emissivity: 0.84,
  transmittance: 0.6,
  reflectance: 0.3,
  absorptance: 0.1,
  enabled: true,
  ...overrides,
})

const closeTo = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`)
}

test('two reflective layers include the infinite reflection series', () => {
  const result = solveShortwave([layer(), layer()], 1000)
  const cavityDenominator = 1 - 0.3 * 0.3

  closeTo(result.forward[1], 600 / cavityDenominator)
  closeTo(result.transmitted, 360 / cavityDenominator)
  assert.ok(result.transmitted > 360, 'returned light should be reflected toward the room again')
})

test('reflected, transmitted, and absorbed energy are conserved', () => {
  const result = solveShortwave([
    layer({ transmittance: 0.82, reflectance: 0.08, absorptance: 0.10 }),
    layer({ transmittance: 0.55, reflectance: 0.38, absorptance: 0.07 }),
    layer({ transmittance: 0.05, reflectance: 0.45, absorptance: 0.50 }),
  ], 700)
  const accounted = result.reflected + result.transmitted + result.absorbed.reduce((sum, value) => sum + value, 0)
  closeTo(accounted, 700, 1e-7)
})

test('a single layer matches the direct optical fractions', () => {
  const result = solveShortwave([layer()], 1000)
  closeTo(result.reflected, 300)
  closeTo(result.transmitted, 600)
  closeTo(result.absorbed[0], 100)
})

test('disabled layers are excluded from the optical solution', () => {
  const active = layer({ id: 'active' })
  const disabled = layer({ id: 'disabled', enabled: false, transmittance: 0, reflectance: 1, absorptance: 0 })
  const settings = { sunlight: 1000, outdoorTemp: 20, indoorTemp: 20 }
  const result = solveSystem([active, disabled], settings)

  closeTo(result.directSolar, 600)
  closeTo(result.reflected, 300)
  assert.equal(result.solarByLayer[1].bypassed, true)
})

test('perfect reflectors remain finite without an iteration cutoff', () => {
  const mirror = layer({ transmittance: 0, reflectance: 1, absorptance: 0 })
  const result = solveShortwave([mirror, mirror], 1000)

  closeTo(result.reflected, 1000)
  closeTo(result.transmitted, 0)
  assert.ok(result.forward.every(Number.isFinite))
  assert.ok(result.backward.every(Number.isFinite))
})
