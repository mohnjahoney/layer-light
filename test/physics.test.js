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

test('energy is conserved across ten representative layer assemblies', async (testContext) => {
  const clearGlass = (overrides = {}) => layer({ transmittance: 0.82, reflectance: 0.08, absorptance: 0.10, ...overrides })
  const solarFilm = (overrides = {}) => layer({ thickness: 0.1, conductivity: 0.2, emissivity: 0.25, transmittance: 0.55, reflectance: 0.38, absorptance: 0.07, ...overrides })
  const curtain = (overrides = {}) => layer({ thickness: 3, conductivity: 0.06, emissivity: 0.9, transmittance: 0.05, reflectance: 0.45, absorptance: 0.50, ...overrides })
  const transparentGap = (kind, overrides = {}) => layer({ kind, thickness: 12, conductivity: kind === 'vacuum' ? 0 : 0.026, emissivity: 0, transmittance: 1, reflectance: 0, absorptance: 0, ...overrides })
  const cases = [
    { name: 'single clear pane', incident: 700, layers: [clearGlass()] },
    { name: 'two clear panes', incident: 700, layers: [clearGlass(), clearGlass()] },
    { name: 'double pane with air gap', incident: 845, layers: [clearGlass(), transparentGap('air'), clearGlass()] },
    { name: 'glass with exterior solar film', incident: 920, layers: [solarFilm(), clearGlass()] },
    { name: 'double pane with room-side curtain', incident: 700, layers: [clearGlass(), transparentGap('air'), clearGlass(), curtain()] },
    { name: 'five clear panes', incident: 1000, layers: Array.from({ length: 5 }, () => clearGlass()) },
    { name: 'high-reflectance cavity', incident: 760, layers: [layer({ transmittance: 0.05, reflectance: 0.90, absorptance: 0.05 }), transparentGap('air'), layer({ transmittance: 0.10, reflectance: 0.85, absorptance: 0.05 })] },
    { name: 'strongly absorbing layers', incident: 615, layers: [layer({ transmittance: 0.10, reflectance: 0.10, absorptance: 0.80 }), layer({ transmittance: 0.20, reflectance: 0.15, absorptance: 0.65 })] },
    { name: 'low-e vacuum assembly', incident: 880, layers: [clearGlass({ emissivity: 0.18 }), transparentGap('vacuum'), solarFilm({ transmittance: 0.68, reflectance: 0.27, absorptance: 0.05 }), clearGlass()] },
    { name: 'disabled reflective layer is bypassed', incident: 730, layers: [clearGlass(), layer({ enabled: false, transmittance: 0, reflectance: 1, absorptance: 0 }), transparentGap('air'), curtain()] },
  ]
  let largestError = 0
  let largestErrorCase = ''

  for (const scenario of cases) {
    await testContext.test(scenario.name, () => {
      const result = solveSystem(scenario.layers, { sunlight: scenario.incident, outdoorTemp: 31, indoorTemp: 22 })
      const absorbed = scenario.layers.reduce((sum, currentLayer, index) => (
        currentLayer.enabled === false ? sum : sum + result.solarByLayer[index].absorbed
      ), 0)
      const accounted = result.reflected + absorbed + result.directSolar
      const error = Math.abs(accounted - scenario.incident)
      const tolerance = Math.max(1e-9, scenario.incident * 1e-10)
      if (error > largestError) {
        largestError = error
        largestErrorCase = scenario.name
      }

      assert.ok(Number.isFinite(accounted), 'the energy total must be finite')
      assert.ok(result.reflected >= 0 && result.directSolar >= 0 && absorbed >= 0, 'all energy destinations must be nonnegative')
      assert.ok(error <= tolerance, `${accounted} W/m² accounted for ${scenario.incident} W/m² incident; error ${error} exceeded ${tolerance}`)
    })
  }
  testContext.diagnostic(`largest absolute error: ${largestError} W/m² (${largestErrorCase || 'all exact'})`)
})
