import { useEffect, useMemo, useRef, useState } from 'react'
import { createPulseViewModel } from './pulseViewModel.js'

const VIEWBOX_WIDTH = 700
const FIELD_TOP = 48
const FIELD_HEIGHT = 104
const TARGET_Y = 238
const TARGET_RADIUS = 19

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const percent = (energy, total) => total > 0 ? 100 * energy / total : 0

function pieSlicePath(cx, cy, radius, fraction) {
  const amount = clamp(fraction, 0, 1)
  if (!(amount > 0) || amount >= 0.999999) return null
  const startAngle = -Math.PI / 2
  const endAngle = startAngle + amount * Math.PI * 2
  const endX = cx + radius * Math.cos(endAngle)
  const endY = cy + radius * Math.sin(endAngle)
  return `M${cx} ${cy} L${cx} ${cy - radius} A${radius} ${radius} 0 ${amount > 0.5 ? 1 : 0} 1 ${endX} ${endY} Z`
}

function pulsePolygon(centerX, yStart, yEnd, direction) {
  const length = 48
  const half = length / 2
  const tip = 8
  const middleY = (yStart + yEnd) / 2
  if (direction === 'inward') {
    return `${centerX - half},${yStart} ${centerX + half - tip},${yStart} ${centerX + half},${middleY} ${centerX + half - tip},${yEnd} ${centerX - half},${yEnd}`
  }
  return `${centerX + half},${yStart} ${centerX - half + tip},${yStart} ${centerX - half},${middleY} ${centerX - half + tip},${yEnd} ${centerX + half},${yEnd}`
}

export function PulseVisualization({ layers, sequence, pulseEnergy }) {
  const view = useMemo(() => createPulseViewModel(sequence), [sequence])
  const [playbackTime, setPlaybackTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const lastFrame = useRef(null)
  const animationFrame = useRef(null)

  useEffect(() => {
    setPlaybackTime(0)
    setPlaying(true)
    lastFrame.current = null
  }, [sequence])

  useEffect(() => {
    if (!playing) return undefined
    const advance = (timestamp) => {
      if (lastFrame.current === null) lastFrame.current = timestamp
      const elapsed = (timestamp - lastFrame.current) / 1000
      lastFrame.current = timestamp
      setPlaybackTime((current) => Math.min(view.duration, current + elapsed * speed))
      animationFrame.current = requestAnimationFrame(advance)
    }
    animationFrame.current = requestAnimationFrame(advance)
    return () => {
      cancelAnimationFrame(animationFrame.current)
      lastFrame.current = null
    }
  }, [playing, speed, view.duration])

  useEffect(() => {
    if (playbackTime >= view.duration) setPlaying(false)
  }, [playbackTime, view.duration])

  const layerX = useMemo(() => {
    const positions = new Map()
    const firstX = 105
    const lastX = 595
    layers.forEach((layer, index) => {
      const x = layers.length <= 1
        ? VIEWBOX_WIDTH / 2
        : firstX + index * (lastX - firstX) / (layers.length - 1)
      positions.set(layer.id, x)
    })
    return positions
  }, [layers])
  const xForLocation = (location) => {
    if (location.type === 'boundary') return location.boundary === 'outdoors' ? 28 : 672
    return layerX.get(location.layerId) ?? VIEWBOX_WIDTH / 2
  }

  const activePulses = view.pulseBands.filter(
    (pulse) => playbackTime >= pulse.displayStart && playbackTime < pulse.displayEnd,
  )
  const activeAbsorptions = view.absorptionBands.filter(
    (absorption) => playbackTime >= absorption.displayStart && playbackTime < absorption.displayEnd,
  )
  const absorbedByLayer = new Map(layers.map((layer) => [layer.id, 0]))
  view.absorptionBands.forEach((absorption) => {
    if (playbackTime >= absorption.displayEnd) {
      absorbedByLayer.set(
        absorption.layerId,
        (absorbedByLayer.get(absorption.layerId) ?? 0) + absorption.energy,
      )
    }
  })
  const boundaryEnergy = { outdoors: 0, room: 0 }
  view.boundaryArrivals.forEach((arrival) => {
    if (playbackTime >= arrival.displayTime) boundaryEnergy[arrival.boundary] += arrival.energy
  })
  const unresolvedEnergy = view.unresolvedArrivals.reduce(
    (sum, arrival) => playbackTime >= arrival.displayTime ? sum + arrival.energy : sum,
    0,
  )

  const restart = () => {
    setPlaybackTime(0)
    setPlaying(true)
  }
  const togglePlayback = () => {
    if (playbackTime >= view.duration) {
      restart()
    } else {
      setPlaying((current) => !current)
    }
  }

  return (
    <div className="pulse-viz">
      <div className="pulse-heading">
        <div><p className="eyebrow">Finite pulse</p><h3>Watch every branch</h3></div>
        <div className="pulse-accounting" aria-live="polite">
          <span>out {percent(boundaryEnergy.outdoors, pulseEnergy).toFixed(1)}%</span>
          <span>room {percent(boundaryEnergy.room, pulseEnergy).toFixed(1)}%</span>
          {unresolvedEnergy > 0 && <span>tail {percent(unresolvedEnergy, pulseEnergy).toFixed(1)}%</span>}
        </div>
      </div>
      <div className="pulse-controls">
        <button onClick={togglePlayback}>{playing ? 'Pause' : playbackTime >= view.duration ? 'Replay' : 'Play'}</button>
        <button onClick={restart}>Restart</button>
        <input
          type="range"
          min="0"
          max={view.duration}
          step="0.01"
          value={playbackTime}
          aria-label="Pulse playback position"
          onChange={(event) => {
            setPlaying(false)
            setPlaybackTime(Number(event.target.value))
          }}
        />
        <span>{playbackTime.toFixed(1)} / {view.duration.toFixed(1)} s</span>
        <label>
          <span className="sr-only">Playback speed</span>
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value="0.5">½×</option>
            <option value="1">1×</option>
            <option value="2">2×</option>
          </select>
        </label>
      </div>
      <svg className="pulse-stage" viewBox={`0 0 ${VIEWBOX_WIDTH} 280`} role="img" aria-label={`Finite ${pulseEnergy} joule per square meter pulse moving through ${layers.length} layers without visual grouping`}>
        <title>Finite pulse playback. Traveling ribbons retain disjoint vertical bands; absorbed branches feed cumulative targets beneath each layer.</title>
        <rect x="18" y={FIELD_TOP - 9} width={VIEWBOX_WIDTH - 36} height={FIELD_HEIGHT + 18} rx="15" className="pulse-field" />
        {layers.map((layer) => {
          const x = layerX.get(layer.id)
          return <line key={`plane-${layer.id}`} x1={x} y1="30" x2={x} y2={TARGET_Y - TARGET_RADIUS - 10} className={`pulse-layer-plane ${layer.enabled === false ? 'disabled' : ''}`} />
        })}

        {activeAbsorptions.map((absorption) => {
          const progress = clamp(
            (playbackTime - absorption.displayStart) / (absorption.displayEnd - absorption.displayStart),
            0,
            1,
          )
          const x = layerX.get(absorption.layerId)
          const yStart = FIELD_TOP + absorption.yStart * FIELD_HEIGHT
          const yEnd = FIELD_TOP + absorption.yEnd * FIELD_HEIGHT
          const middleY = (yStart + yEnd) / 2
          const branchWidth = Math.max(0, yEnd - yStart)
          const path = `M${x} ${middleY} H${x + 7} Q${x + 12} ${middleY} ${x + 12} ${middleY + 6} V${TARGET_Y - TARGET_RADIUS - 6} Q${x + 12} ${TARGET_Y - TARGET_RADIUS} ${x + 6} ${TARGET_Y - TARGET_RADIUS} H${x}`
          return (
            <path
              key={absorption.absorptionEventId}
              d={path}
              pathLength="1"
              className="pulse-absorption-branch"
              style={{ strokeWidth: branchWidth, strokeDasharray: `${progress} 1` }}
            />
          )
        })}

        {activePulses.map((pulse) => {
          const progress = clamp(
            (playbackTime - pulse.displayStart) / (pulse.displayEnd - pulse.displayStart),
            0,
            1,
          )
          const originX = xForLocation(pulse.origin)
          const destinationX = xForLocation(pulse.destination)
          const centerX = originX + (destinationX - originX) * progress
          const yStart = FIELD_TOP + pulse.yStart * FIELD_HEIGHT
          const yEnd = FIELD_TOP + pulse.yEnd * FIELD_HEIGHT
          return (
            <polygon
              key={pulse.id}
              points={pulsePolygon(centerX, yStart, yEnd, pulse.direction)}
              className={`pulse-packet ${pulse.direction}`}
            >
              <title>{pulse.energy.toFixed(2)} J/m² moving {pulse.direction}</title>
            </polygon>
          )
        })}

        {layers.map((layer) => {
          const x = layerX.get(layer.id)
          const absorbed = absorbedByLayer.get(layer.id) ?? 0
          const fraction = pulseEnergy > 0 ? absorbed / pulseEnergy : 0
          const slice = pieSlicePath(x, TARGET_Y, TARGET_RADIUS, fraction)
          return (
            <g key={`target-${layer.id}`} className={`absorption-target ${layer.enabled === false ? 'disabled' : ''}`}>
              <circle cx={x} cy={TARGET_Y} r={TARGET_RADIUS} className="target-remainder" />
              {fraction >= 0.999999
                ? <circle cx={x} cy={TARGET_Y} r={TARGET_RADIUS} className="target-fill" />
                : slice && <path d={slice} className="target-fill" />}
              <circle cx={x} cy={TARGET_Y} r={TARGET_RADIUS} className="target-outline" />
              <text x={x} y={TARGET_Y + 30} textAnchor="middle">{percent(absorbed, pulseEnergy).toFixed(1)}%</text>
              <title>{layer.name}: {absorbed.toFixed(2)} J/m² absorbed, {percent(absorbed, pulseEnergy).toFixed(1)}% of the initial pulse</title>
            </g>
          )
        })}
      </svg>
      <div className="pulse-legend">
        <span><i className="inward" />Inward</span>
        <span><i className="outward" />Outward</span>
        <span><i className="absorbed" />Absorbed</span>
        <b>1 s solar dose · {pulseEnergy.toFixed(0)} J/m²</b>
      </div>
    </div>
  )
}
