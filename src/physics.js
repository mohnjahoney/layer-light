const SIGMA = 5.670374419e-8

export const MATERIALS = {
  glass: {
    name: 'Clear glass', kind: 'solid', color: '#a9d9d5', thickness: 4,
    conductivity: 1, emissivity: 0.84, transmittance: 0.82, reflectance: 0.08, absorptance: 0.10,
  },
  film: {
    name: 'Solar film', kind: 'solid', color: '#d8a95d', thickness: 0.1,
    conductivity: 0.2, emissivity: 0.25, transmittance: 0.55, reflectance: 0.38, absorptance: 0.07,
  },
  curtain: {
    name: 'Curtain', kind: 'solid', color: '#c98a73', thickness: 3,
    conductivity: 0.06, emissivity: 0.90, transmittance: 0.05, reflectance: 0.45, absorptance: 0.50,
  },
  shade: {
    name: 'Reflective shade', kind: 'solid', color: '#d6d1c2', thickness: 1,
    conductivity: 0.15, emissivity: 0.18, transmittance: 0.08, reflectance: 0.78, absorptance: 0.14,
  },
  air: {
    name: 'Air gap', kind: 'air', color: '#617f84', thickness: 12,
    conductivity: 0.026, emissivity: 0, transmittance: 1, reflectance: 0, absorptance: 0,
  },
  vacuum: {
    name: 'Vacuum gap', kind: 'vacuum', color: '#344b50', thickness: 12,
    conductivity: 0, emissivity: 0, transmittance: 1, reflectance: 0, absorptance: 0,
  },
}

export function newLayer(type) {
  return { ...MATERIALS[type], type, enabled: true, id: `${type}-${crypto.randomUUID()}` }
}

function gapResistance(layer, leftE, rightE, meanK) {
  const d = Math.max(layer.thickness / 1000, 0.0005)
  const e1 = Math.max(leftE ?? 0.84, 0.02)
  const e2 = Math.max(rightE ?? 0.84, 0.02)
  const hRadiation = (4 * SIGMA * meanK ** 3) / (1 / e1 + 1 / e2 - 1)
  const hGas = layer.kind === 'vacuum' ? 0 : layer.conductivity / d
  const hConvection = layer.kind === 'air' && d >= 0.006 ? 1.5 : 0
  return 1 / Math.max(hRadiation + hGas + hConvection, 0.05)
}

function layerResistance(layer, index, layers, meanK) {
  if (layer.kind === 'air' || layer.kind === 'vacuum') {
    const left = layers[index - 1]?.emissivity
    const right = layers[index + 1]?.emissivity
    return gapResistance(layer, left, right, meanK)
  }
  return Math.max(layer.thickness / 1000, 0.00001) / Math.max(layer.conductivity, 0.001)
}

function solveTemperatures(resistances, sources, outside, inside) {
  const n = resistances.length
  if (!n) return []
  const boundaryOut = 1 / 20 + resistances[0] / 2
  const boundaryIn = 1 / 8 + resistances[n - 1] / 2
  const lower = Array(n).fill(0)
  const diag = Array(n).fill(0)
  const upper = Array(n).fill(0)
  const rhs = [...sources]

  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      const g = 1 / boundaryOut
      diag[i] += g
      rhs[i] += g * outside
    } else {
      const g = 1 / (resistances[i - 1] / 2 + resistances[i] / 2)
      diag[i] += g
      lower[i] = -g
    }
    if (i === n - 1) {
      const g = 1 / boundaryIn
      diag[i] += g
      rhs[i] += g * inside
    } else {
      const g = 1 / (resistances[i] / 2 + resistances[i + 1] / 2)
      diag[i] += g
      upper[i] = -g
    }
  }

  for (let i = 1; i < n; i += 1) {
    const m = lower[i] / diag[i - 1]
    diag[i] -= m * upper[i - 1]
    rhs[i] -= m * rhs[i - 1]
  }
  const result = Array(n).fill(0)
  result[n - 1] = rhs[n - 1] / diag[n - 1]
  for (let i = n - 2; i >= 0; i -= 1) result[i] = (rhs[i] - upper[i] * result[i + 1]) / diag[i]
  return result
}

export function solveSystem(layers, settings) {
  const activeLayers = layers.filter((layer) => layer.enabled !== false)
  const outside = settings.outdoorTemp
  const inside = settings.indoorTemp
  const meanK = ((outside + inside) / 2) + 273.15
  const resistances = activeLayers.map((layer, i) => layerResistance(layer, i, activeLayers, meanK))

  let shortwave = settings.sunlight
  let reflected = 0
  const solarByLayer = layers.map((layer) => {
    const incoming = shortwave
    if (layer.enabled === false) return { incoming, reflected: 0, absorbed: 0, transmitted: incoming, bypassed: true }
    const layerReflected = incoming * layer.reflectance
    const layerAbsorbed = incoming * layer.absorptance
    shortwave = incoming * layer.transmittance
    reflected += layerReflected
    return { incoming, reflected: layerReflected, absorbed: layerAbsorbed, transmitted: shortwave, bypassed: false }
  })
  const solarById = new Map(layers.map((layer, index) => [layer.id, solarByLayer[index]]))
  const absorbed = activeLayers.map((layer) => solarById.get(layer.id).absorbed)

  const activeTemperatures = solveTemperatures(resistances, absorbed, outside, inside)
  const temperatureById = new Map(activeLayers.map((layer, index) => [layer.id, activeTemperatures[index]]))
  const temperatures = layers.map((layer) => layer.enabled === false ? null : temperatureById.get(layer.id))
  const baselineTemperatures = solveTemperatures(resistances, activeLayers.map(() => 0), outside, inside)
  const boundaryIn = activeLayers.length ? 1 / 8 + resistances.at(-1) / 2 : 1 / 8 + 1 / 20
  const inwardThermal = activeLayers.length ? (activeTemperatures.at(-1) - inside) / boundaryIn : (outside - inside) / boundaryIn
  const baseline = activeLayers.length ? (baselineTemperatures.at(-1) - inside) / boundaryIn : inwardThermal
  const absorbedToRoom = inwardThermal - baseline
  const totalGain = shortwave + inwardThermal
  const rejected = Math.max(0, settings.sunlight - reflected - shortwave - absorbedToRoom)
  const totalR = 1 / 20 + resistances.reduce((sum, r) => sum + r, 0) + 1 / 8

  return {
    temperatures,
    solarByLayer,
    resistances,
    totalR,
    reflected,
    directSolar: shortwave,
    absorbedToRoom,
    baseline,
    totalGain,
    rejected,
  }
}
