import { partitionShortwave } from './physics.js'

export const SPEED_OF_LIGHT = 299_792_458

const oppositeDirection = (direction) => direction === 'inward' ? 'outward' : 'inward'

function buildGeometry(layers) {
  let position = 0
  const layerLocations = layers.map((layer, layerIndex) => {
    const thickness = Math.max(0, Number(layer.thickness) || 0) / 1000
    const location = {
      type: 'layer',
      layerId: layer.id,
      layerIndex,
      position: position + thickness / 2,
    }
    position += thickness
    return location
  })

  return {
    layerLocations,
    outdoors: { type: 'boundary', boundary: 'outdoors', position: 0 },
    room: { type: 'boundary', boundary: 'room', position },
  }
}

// Expands a finite shortwave pulse into a renderer-neutral causal event graph.
// Energies are J/m² and event times are seconds.
export function solvePulseSequence(layers, incidentEnergy, options = {}) {
  const activeLayers = layers.filter((layer) => layer.enabled !== false)
  const energy = Math.max(0, Number(incidentEnergy) || 0)
  const propagationSpeed = options.propagationSpeed ?? SPEED_OF_LIGHT
  const startTime = options.startTime ?? 0
  const timeHorizon = options.timeHorizon ?? Number.POSITIVE_INFINITY
  const energyThreshold = options.energyThreshold ?? energy * 1e-6
  const maxEvents = options.maxEvents ?? 10_000

  if (!(propagationSpeed > 0)) throw new RangeError('propagationSpeed must be greater than zero')
  if (!(energyThreshold >= 0)) throw new RangeError('energyThreshold must be nonnegative')
  if (!(timeHorizon >= startTime)) throw new RangeError('timeHorizon must not precede startTime')
  if (!Number.isInteger(maxEvents) || maxEvents < 1) throw new RangeError('maxEvents must be a positive integer')

  const geometry = buildGeometry(activeLayers)
  const pulses = []
  const splitEvents = []
  const absorptionEvents = []
  const boundaryArrivals = []
  const pending = []
  let pulseNumber = 0
  let splitNumber = 0
  let absorptionNumber = 0
  let absorbedEnergy = 0
  let escapedOutdoorsEnergy = 0
  let enteredRoomEnergy = 0
  let unresolvedEnergy = 0

  const targetFrom = (layerIndex, direction) => {
    const nextIndex = layerIndex + (direction === 'inward' ? 1 : -1)
    if (nextIndex < 0) return geometry.outdoors
    if (nextIndex >= activeLayers.length) return geometry.room
    return geometry.layerLocations[nextIndex]
  }

  const markUnresolved = (pulse, reason) => {
    if (pulse.status === 'unresolved') return
    pulse.status = 'unresolved'
    pulse.unresolvedReason = reason
    unresolvedEnergy += pulse.energy
  }

  const createPulse = ({
    parentId,
    generation,
    pulseEnergy,
    direction,
    origin,
    destination,
    departAt,
  }) => {
    if (!(pulseEnergy > 0)) return null
    const arrivalAt = departAt + Math.abs(destination.position - origin.position) / propagationSpeed
    const pulse = {
      id: `pulse-${pulseNumber}`,
      sequence: pulseNumber,
      parentId,
      generation,
      energy: pulseEnergy,
      direction,
      origin,
      destination,
      departAt,
      arrivalAt,
      status: 'pending',
    }
    pulseNumber += 1
    pulses.push(pulse)

    if (arrivalAt > timeHorizon) {
      markUnresolved(pulse, 'time-horizon')
    } else if (destination.type === 'boundary') {
      pulse.status = 'escaped'
      boundaryArrivals.push({
        pulseId: pulse.id,
        boundary: destination.boundary,
        direction,
        energy: pulseEnergy,
        time: arrivalAt,
      })
      if (destination.boundary === 'outdoors') escapedOutdoorsEnergy += pulseEnergy
      else enteredRoomEnergy += pulseEnergy
    } else if (pulseEnergy < energyThreshold) {
      markUnresolved(pulse, 'energy-threshold')
    } else {
      pending.push(pulse)
    }

    return pulse
  }

  if (energy > 0) {
    const firstDestination = geometry.layerLocations[0] ?? geometry.room
    createPulse({
      parentId: null,
      generation: 0,
      pulseEnergy: energy,
      direction: 'inward',
      origin: geometry.outdoors,
      destination: firstDestination,
      departAt: startTime,
    })
  }

  while (pending.length) {
    pending.sort((a, b) => a.arrivalAt - b.arrivalAt || a.sequence - b.sequence)
    const pulse = pending.shift()

    if (splitEvents.length >= maxEvents) {
      markUnresolved(pulse, 'event-limit')
      pending.forEach((queuedPulse) => markUnresolved(queuedPulse, 'event-limit'))
      pending.length = 0
      break
    }

    const layerIndex = pulse.destination.layerIndex
    const layer = activeLayers[layerIndex]
    const location = geometry.layerLocations[layerIndex]
    const partition = partitionShortwave(layer, pulse.energy)
    const splitEvent = {
      id: `split-${splitNumber}`,
      type: 'split',
      pulseId: pulse.id,
      layerId: layer.id,
      layerIndex,
      time: pulse.arrivalAt,
      incidentDirection: pulse.direction,
      incidentEnergy: pulse.energy,
      transmittedEnergy: partition.transmitted,
      reflectedEnergy: partition.reflected,
      absorbedEnergy: partition.absorbed,
      transmittedPulseId: null,
      reflectedPulseId: null,
      absorptionEventId: null,
    }
    splitNumber += 1
    pulse.status = 'split'
    pulse.splitEventId = splitEvent.id

    if (partition.absorbed > 0) {
      const absorption = {
        id: `absorption-${absorptionNumber}`,
        type: 'absorption',
        parentPulseId: pulse.id,
        layerId: layer.id,
        layerIndex,
        fromDirection: pulse.direction,
        energy: partition.absorbed,
        time: pulse.arrivalAt,
      }
      absorptionNumber += 1
      absorptionEvents.push(absorption)
      splitEvent.absorptionEventId = absorption.id
      absorbedEnergy += partition.absorbed
    }

    const transmittedPulse = createPulse({
      parentId: pulse.id,
      generation: pulse.generation + 1,
      pulseEnergy: partition.transmitted,
      direction: pulse.direction,
      origin: location,
      destination: targetFrom(layerIndex, pulse.direction),
      departAt: pulse.arrivalAt,
    })
    const reflectedDirection = oppositeDirection(pulse.direction)
    const reflectedPulse = createPulse({
      parentId: pulse.id,
      generation: pulse.generation + 1,
      pulseEnergy: partition.reflected,
      direction: reflectedDirection,
      origin: location,
      destination: targetFrom(layerIndex, reflectedDirection),
      departAt: pulse.arrivalAt,
    })
    splitEvent.transmittedPulseId = transmittedPulse?.id ?? null
    splitEvent.reflectedPulseId = reflectedPulse?.id ?? null
    splitEvents.push(splitEvent)
  }

  boundaryArrivals.sort((a, b) => a.time - b.time || a.pulseId.localeCompare(b.pulseId))
  absorptionEvents.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  const accountedEnergy = absorbedEnergy + escapedOutdoorsEnergy + enteredRoomEnergy + unresolvedEnergy

  return {
    activeLayerIds: activeLayers.map((layer) => layer.id),
    geometry,
    pulses,
    splitEvents,
    absorptionEvents,
    boundaryArrivals,
    totals: {
      incidentEnergy: energy,
      absorbedEnergy,
      escapedOutdoorsEnergy,
      enteredRoomEnergy,
      unresolvedEnergy,
      accountedEnergy,
      conservationResidual: energy - accountedEnergy,
    },
    limits: {
      energyThreshold,
      timeHorizon,
      maxEvents,
      propagationSpeed,
    },
  }
}
