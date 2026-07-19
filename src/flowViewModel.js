export function createFlowViewModel(layers, solution) {
  const interactionById = new Map(
    solution.shortwave.layerInteractions.map((interaction) => [interaction.layerId, interaction]),
  )
  const temperatureById = new Map(
    solution.thermal.layerTemperatures.map(({ layerId, temperature }) => [layerId, temperature]),
  )
  const resistanceById = new Map(
    solution.thermal.layerResistances.map(({ layerId, resistance }) => [layerId, resistance]),
  )
  let activeIndex = 0

  const layerFlows = layers.map((layer) => {
    const interfaceBefore = solution.shortwave.interfaces[activeIndex]
    if (layer.enabled === false) {
      return {
        layerId: layer.id,
        inwardFluxBefore: interfaceBefore.inwardFlux,
        inwardFluxAfter: interfaceBefore.inwardFlux,
        outwardFluxBefore: interfaceBefore.outwardFlux,
        outwardFluxAfter: interfaceBefore.outwardFlux,
        localOutwardReflectionFlux: 0,
        absorbedFlux: 0,
        bypassed: true,
      }
    }

    const interaction = interactionById.get(layer.id)
    const interfaceAfter = solution.shortwave.interfaces[activeIndex + 1]
    activeIndex += 1
    return {
      layerId: layer.id,
      inwardFluxBefore: interfaceBefore.inwardFlux,
      inwardFluxAfter: interfaceAfter.inwardFlux,
      outwardFluxBefore: interfaceBefore.outwardFlux,
      outwardFluxAfter: interfaceAfter.outwardFlux,
      localOutwardReflectionFlux: interaction.reflectedFlux.outward,
      absorbedFlux: interaction.absorbedFlux.total,
      bypassed: false,
    }
  })

  const totalAbsorbedFlux = solution.shortwave.totals.absorbedFlux
  const absorbedToRoom = solution.thermal.solarDrivenInwardFlux

  return {
    layerFlows,
    temperatures: layers.map((layer) => temperatureById.get(layer.id) ?? null),
    resistances: layers.map((layer) => resistanceById.get(layer.id) ?? null),
    totalResistance: solution.thermal.totalResistance,
    escapedOutwardFlux: solution.shortwave.boundaries.outdoors.escapingOutwardFlux,
    enteringRoomShortwaveFlux: solution.shortwave.boundaries.room.enteringInwardFlux,
    absorbedToRoomFlux: absorbedToRoom,
    absorbedToOutdoorsFlux: Math.max(0, totalAbsorbedFlux - absorbedToRoom),
    roomInwardFlux: solution.roomInwardFlux,
    energyBalanceResidual: solution.shortwave.totals.energyBalanceResidual,
  }
}
