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

export function partitionShortwave(layer, incidentEnergy) {
  const incident = Math.max(0, incidentEnergy)
  return {
    transmitted: layer.transmittance * incident,
    reflected: layer.reflectance * incident,
    absorbed: layer.absorptance * incident,
  }
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

// Solves the infinite series of incoherent internal reflections without
// iterating individual bounces. suffixReflectance[i] is the effective
// reflectance of every layer from i through the room-side boundary.
export function solveShortwave(layers, incident) {
  const count = layers.length
  const suffixReflectance = Array(count + 1).fill(0)
  const inwardFluxes = Array(count + 1).fill(0)
  const outwardFluxes = Array(count + 1).fill(0)
  const EPSILON = 1e-12

  for (let index = count - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    const denominator = 1 - layer.reflectance * suffixReflectance[index + 1]
    const returned = denominator > EPSILON
      ? (layer.transmittance ** 2 * suffixReflectance[index + 1]) / denominator
      : 0
    suffixReflectance[index] = Math.min(1, Math.max(0, layer.reflectance + returned))
  }

  inwardFluxes[0] = Math.max(0, incident)
  for (let index = 0; index < count; index += 1) {
    const layer = layers[index]
    const denominator = 1 - layer.reflectance * suffixReflectance[index + 1]
    inwardFluxes[index + 1] = denominator > EPSILON
      ? layer.transmittance * inwardFluxes[index] / denominator
      : 0
  }

  for (let index = count - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    outwardFluxes[index] = layer.reflectance * inwardFluxes[index] + layer.transmittance * outwardFluxes[index + 1]
  }

  const interfaces = inwardFluxes.map((inwardFlux, index) => ({
    index,
    inwardFlux,
    outwardFlux: outwardFluxes[index],
    netInwardFlux: inwardFlux - outwardFluxes[index],
  }))
  const layerInteractions = layers.map((layer, index) => {
    const inwardPartition = partitionShortwave(layer, inwardFluxes[index])
    const outwardPartition = partitionShortwave(layer, outwardFluxes[index + 1])
    return {
      layerId: layer.id,
      incidentFlux: {
        inward: inwardFluxes[index],
        outward: outwardFluxes[index + 1],
      },
      reflectedFlux: {
        inward: outwardPartition.reflected,
        outward: inwardPartition.reflected,
      },
      transmittedFlux: {
        inward: inwardPartition.transmitted,
        outward: outwardPartition.transmitted,
      },
      absorbedFlux: {
        fromInward: inwardPartition.absorbed,
        fromOutward: outwardPartition.absorbed,
        total: inwardPartition.absorbed + outwardPartition.absorbed,
      },
    }
  })
  const totalAbsorbedFlux = layerInteractions.reduce((sum, interaction) => sum + interaction.absorbedFlux.total, 0)
  const incidentInwardFlux = inwardFluxes[0] ?? Math.max(0, incident)
  const escapingOutwardFlux = outwardFluxes[0] ?? 0
  const enteringInwardFlux = inwardFluxes[count] ?? incidentInwardFlux
  const energyBalanceResidual = incidentInwardFlux - escapingOutwardFlux - enteringInwardFlux - totalAbsorbedFlux

  return {
    interfaces,
    layerInteractions,
    boundaries: {
      outdoors: {
        incidentInwardFlux,
        escapingOutwardFlux,
      },
      room: {
        enteringInwardFlux,
        incidentOutwardFlux: outwardFluxes[count] ?? 0,
      },
    },
    totals: {
      absorbedFlux: totalAbsorbedFlux,
      energyBalanceResidual,
      relativeEnergyBalanceResidual: incidentInwardFlux > 0
        ? energyBalanceResidual / incidentInwardFlux
        : 0,
    },
  }
}

export function solveSystem(layers, settings) {
  const activeLayers = layers.filter((layer) => layer.enabled !== false)
  const outside = settings.outdoorTemp
  const inside = settings.indoorTemp
  const meanK = ((outside + inside) / 2) + 273.15
  const resistances = activeLayers.map((layer, i) => layerResistance(layer, i, activeLayers, meanK))

  const shortwave = solveShortwave(activeLayers, settings.sunlight)
  const absorbed = shortwave.layerInteractions.map((interaction) => interaction.absorbedFlux.total)

  const activeTemperatures = solveTemperatures(resistances, absorbed, outside, inside)
  const baselineTemperatures = solveTemperatures(resistances, activeLayers.map(() => 0), outside, inside)
  const boundaryIn = activeLayers.length ? 1 / 8 + resistances.at(-1) / 2 : 1 / 8 + 1 / 20
  const inwardThermal = activeLayers.length ? (activeTemperatures.at(-1) - inside) / boundaryIn : (outside - inside) / boundaryIn
  const baseline = activeLayers.length ? (baselineTemperatures.at(-1) - inside) / boundaryIn : inwardThermal
  const absorbedToRoom = inwardThermal - baseline
  const roomInwardFlux = shortwave.boundaries.room.enteringInwardFlux + inwardThermal
  const totalR = 1 / 20 + resistances.reduce((sum, r) => sum + r, 0) + 1 / 8

  return {
    activeLayerIds: activeLayers.map((layer) => layer.id),
    shortwave,
    thermal: {
      layerTemperatures: activeLayers.map((layer, index) => ({
        layerId: layer.id,
        temperature: activeTemperatures[index],
      })),
      layerResistances: activeLayers.map((layer, index) => ({
        layerId: layer.id,
        resistance: resistances[index],
      })),
      totalResistance: totalR,
      inwardFlux: inwardThermal,
      baselineInwardFlux: baseline,
      solarDrivenInwardFlux: absorbedToRoom,
    },
    roomInwardFlux,
  }
}
