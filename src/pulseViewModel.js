export const PULSE_HOP_SECONDS = 0.72
export const ABSORPTION_DROP_SECONDS = 0.46

export function createPulseViewModel(sequence) {
  const bandByPulseId = new Map()
  const pulseById = new Map(sequence.pulses.map((pulse) => [pulse.id, pulse]))
  const rootPulses = sequence.pulses.filter((pulse) => pulse.parentId === null)

  rootPulses.forEach((pulse) => {
    bandByPulseId.set(pulse.id, {
      pulseId: pulse.id,
      yStart: 0,
      yEnd: 1,
    })
  })

  const absorptionBands = []
  for (const event of sequence.splitEvents) {
    const parentBand = bandByPulseId.get(event.pulseId)
    if (!parentBand || !(event.incidentEnergy > 0)) continue

    const bandHeight = parentBand.yEnd - parentBand.yStart
    const reflectedHeight = bandHeight * event.reflectedEnergy / event.incidentEnergy
    const transmittedHeight = bandHeight * event.transmittedEnergy / event.incidentEnergy
    const absorbedHeight = bandHeight * event.absorbedEnergy / event.incidentEnergy
    const reflectedEnd = parentBand.yStart + reflectedHeight
    const transmittedEnd = reflectedEnd + transmittedHeight
    const absorbedEnd = Math.min(parentBand.yEnd, transmittedEnd + absorbedHeight)

    if (event.reflectedPulseId) {
      bandByPulseId.set(event.reflectedPulseId, {
        pulseId: event.reflectedPulseId,
        yStart: parentBand.yStart,
        yEnd: reflectedEnd,
      })
    }
    if (event.transmittedPulseId) {
      bandByPulseId.set(event.transmittedPulseId, {
        pulseId: event.transmittedPulseId,
        yStart: reflectedEnd,
        yEnd: transmittedEnd,
      })
    }
    if (event.absorptionEventId && absorbedHeight > 0) {
      const parentPulse = pulseById.get(event.pulseId)
      const displayStart = (parentPulse?.generation + 1 || 1) * PULSE_HOP_SECONDS
      absorptionBands.push({
        absorptionEventId: event.absorptionEventId,
        parentPulseId: event.pulseId,
        layerId: event.layerId,
        layerIndex: event.layerIndex,
        energy: event.absorbedEnergy,
        yStart: transmittedEnd,
        yEnd: absorbedEnd,
        displayStart,
        displayEnd: displayStart + ABSORPTION_DROP_SECONDS,
      })
    }
  }

  const pulseBands = sequence.pulses.flatMap((pulse) => {
    const band = bandByPulseId.get(pulse.id)
    if (!band) return []
    return [{
      ...pulse,
      ...band,
      displayStart: pulse.generation * PULSE_HOP_SECONDS,
      displayEnd: (pulse.generation + 1) * PULSE_HOP_SECONDS,
    }]
  })
  const boundaryArrivals = sequence.boundaryArrivals.flatMap((arrival) => {
    const pulse = pulseById.get(arrival.pulseId)
    return pulse ? [{
      ...arrival,
      displayTime: (pulse.generation + 1) * PULSE_HOP_SECONDS,
    }] : []
  })
  const unresolvedArrivals = pulseBands
    .filter((pulse) => pulse.status === 'unresolved')
    .map((pulse) => ({
      pulseId: pulse.id,
      energy: pulse.energy,
      displayTime: pulse.displayEnd,
      reason: pulse.unresolvedReason,
    }))
  const duration = Math.max(
    PULSE_HOP_SECONDS,
    ...pulseBands.map((pulse) => pulse.displayEnd),
    ...absorptionBands.map((absorption) => absorption.displayEnd),
  )

  return {
    pulseBands,
    absorptionBands,
    boundaryArrivals,
    unresolvedArrivals,
    duration,
  }
}
