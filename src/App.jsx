import { useEffect, useMemo, useRef, useState } from 'react'
import { MATERIALS, newLayer, solveSystem } from './physics.js'

const INITIAL = [newLayer('glass'), newLayer('air'), newLayer('glass'), newLayer('curtain')]

const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—'

function TernaryControl({ value, onChange }) {
  const svgRef = useRef(null)
  const vertices = { t: [110, 15], r: [16, 178], a: [204, 178] }
  const point = [
    value.transmittance * vertices.t[0] + value.reflectance * vertices.r[0] + value.absorptance * vertices.a[0],
    value.transmittance * vertices.t[1] + value.reflectance * vertices.r[1] + value.absorptance * vertices.a[1],
  ]

  const update = (event) => {
    const rect = svgRef.current.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (220 / rect.width)
    const y = (event.clientY - rect.top) * (198 / rect.height)
    const [x1, y1] = vertices.t
    const [x2, y2] = vertices.r
    const [x3, y3] = vertices.a
    const denominator = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
    let t = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / denominator
    let r = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / denominator
    let a = 1 - t - r
    t = Math.max(0, t); r = Math.max(0, r); a = Math.max(0, a)
    const sum = t + r + a || 1
    onChange({ transmittance: t / sum, reflectance: r / sum, absorptance: a / sum })
  }

  return (
    <div className="ternary-wrap">
      <svg ref={svgRef} className="ternary" viewBox="0 0 220 198"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); update(e) }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e) }}>
        <path d="M110 15 L16 178 L204 178 Z" className="triangle-bg" />
        <path d="M110 15 L16 178 L204 178 Z M63 96.5 L157 96.5 M63 96.5 L110 178 M157 96.5 L110 178" className="triangle-grid" />
        <circle cx={point[0]} cy={point[1]} r="8" className="triangle-dot" />
        <text x="110" y="11" textAnchor="middle">Transmit</text>
        <text x="2" y="194">Reflect</text>
        <text x="218" y="194" textAnchor="end">Absorb</text>
      </svg>
      <div className="ternary-values">
        <span>T {Math.round(value.transmittance * 100)}%</span>
        <span>R {Math.round(value.reflectance * 100)}%</span>
        <span>A {Math.round(value.absorptance * 100)}%</span>
      </div>
    </div>
  )
}

function NumberField({ label, value, unit, min = 0, max, step = 0.01, onChange }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /><em>{unit}</em></div>
    </label>
  )
}

function EnergyBar({ result, sunlight }) {
  const values = [
    { label: 'Reflected', value: result.reflected, color: '#82aeb5' },
    { label: 'Direct solar', value: result.directSolar, color: '#f1b94d' },
    { label: 'Absorbed → room', value: Math.max(0, result.absorbedToRoom), color: '#df7558' },
    { label: 'Rejected outdoors', value: result.rejected, color: '#4e7477' },
  ]
  return (
    <div className="energy-viz">
      <div className="energy-bar" aria-label="Solar energy destinations">
        {values.map((item) => <span key={item.label} style={{ width: `${sunlight ? item.value / sunlight * 100 : 0}%`, background: item.color }} />)}
      </div>
      <div className="energy-legend">
        {values.map((item) => <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{fmt(item.value)} W/m²</strong></div>)}
      </div>
    </div>
  )
}

function EnergyRibbons({ layers, flows, sunlight }) {
  const widthFor = (value, max = 22) => sunlight > 0 ? Math.max(value > 0 ? 1.5 : 0, max * value / sunlight) : 0
  return (
    <div className="ribbon-viz">
      <div className="ribbon-heading">
        <div><p className="eyebrow">Solar journey</p><h3>Follow the energy</h3></div>
        <div className="ribbon-arrival"><span>arrives in room</span><strong>{fmt(flows.at(-1)?.transmitted ?? sunlight)} W/m²</strong></div>
      </div>
      <div className="ribbon-legend"><span><i className="transmitted" />Moving inward</span><span><i className="reflected" />Sent back outside</span><span><i className="absorbed" />Held by layer</span></div>
      <div className="ribbon-track" style={{ gridTemplateColumns: `repeat(${Math.max(layers.length, 1)}, 78px)` }} aria-label="Shortwave solar energy flow through layers">
        {layers.map((layer, index) => {
          const flow = flows[index]
          const reflectedWidth = widthFor(flow.reflected, 17)
          const absorbedWidth = widthFor(flow.absorbed, 17)
          const markerId = `arrow-${index}-${layer.id}`
          const isLast = index === layers.length - 1
          return (
            <svg key={layer.id} className={`ribbon-cell ${flow.bypassed ? 'bypassed' : ''}`} viewBox="0 0 78 170" role="img" aria-label={`${layer.name}: ${fmt(flow.transmitted)} watts per square meter transmitted, ${fmt(flow.reflected)} reflected, ${fmt(flow.absorbed)} absorbed`}>
              <title>{layer.name}: {fmt(flow.transmitted)} transmitted · {fmt(flow.reflected)} reflected · {fmt(flow.absorbed)} absorbed W/m²</title>
              <defs>
                <marker id={`${markerId}-gold`} markerWidth="20" markerHeight="20" refX="16" refY="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L20 10 L0 20 Z" className="arrow-gold" /></marker>
                <marker id={`${markerId}-blue`} markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L14 7 L0 14 Z" className="arrow-blue" /></marker>
                <marker id={`${markerId}-coral`} markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L14 7 L0 14 Z" className="arrow-coral" /></marker>
              </defs>
              <path d="M-9 83 C7 83 25 83 40 83" className="ribbon transmitted ribbon-glow" style={{ strokeWidth: widthFor(flow.incoming) }} />
              <path d="M39 83 C54 83 70 83 87 83" className="ribbon transmitted ribbon-glow" style={{ strokeWidth: widthFor(flow.transmitted) }} markerEnd={isLast ? `url(#${markerId}-gold)` : undefined} />
              {!flow.bypassed && flow.reflected > 0 && <path d="M40 83 C28 69 26 39 -8 20" className="ribbon reflected" style={{ strokeWidth: reflectedWidth }} markerEnd={`url(#${markerId}-blue)`} />}
              {!flow.bypassed && flow.absorbed > 0 && <path d="M40 83 C53 101 28 124 40 158" className="ribbon absorbed" style={{ strokeWidth: absorbedWidth }} markerEnd={`url(#${markerId}-coral)`} />}
              <circle cx="40" cy="83" r={Math.max(5, widthFor(flow.incoming) / 2)} className="ribbon-junction-halo" />
              <circle cx="40" cy="83" r={Math.max(3, widthFor(flow.incoming) / 3.2)} className="ribbon-junction" />
              {!flow.bypassed && flow.reflected >= sunlight * .04 && <text x="5" y="12" textAnchor="middle" className="branch-value reflected-value">{fmt(flow.reflected)}</text>}
              {!flow.bypassed && flow.absorbed >= sunlight * .04 && <text x="40" y="168" textAnchor="middle" className="branch-value absorbed-value">{fmt(flow.absorbed)}</text>}
              {flow.bypassed && <><rect x="22" y="66" width="36" height="34" rx="9" className="bypass-box" /><text x="40" y="56" textAnchor="middle">BYPASS</text></>}
            </svg>
          )
        })}
      </div>
    </div>
  )
}

export default function App() {
  const [layers, setLayers] = useState(INITIAL)
  const [selectedId, setSelectedId] = useState(INITIAL[0].id)
  const [settings, setSettings] = useState({ sunlight: 700, outdoorTemp: 32, indoorTemp: 22 })
  const [flowVisible, setFlowVisible] = useState(true)
  const [dragUi, setDragUi] = useState({ holdingId: null, draggingId: null })
  const dragTimer = useRef(null)
  const dragState = useRef(null)
  const result = useMemo(() => solveSystem(layers, settings), [layers, settings])
  const selected = layers.find((layer) => layer.id === selectedId)

  useEffect(() => () => clearTimeout(dragTimer.current), [])

  const updateSelected = (changes) => setLayers((items) => items.map((item) => item.id === selectedId ? { ...item, ...changes } : item))
  const toggleLayer = (id) => setLayers((items) => items.map((item) => item.id === id ? { ...item, enabled: item.enabled === false } : item))
  const addLayer = (type) => {
    const layer = newLayer(type)
    setLayers((items) => [...items, layer])
    setSelectedId(layer.id)
  }
  const move = (index, amount) => {
    const nextIndex = index + amount
    if (nextIndex < 0 || nextIndex >= layers.length) return
    setLayers((items) => { const next = [...items]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next })
  }
  const reorderLayer = (movingId, targetId) => {
    if (movingId === targetId) return
    setLayers((items) => {
      const from = items.findIndex((item) => item.id === movingId)
      const to = items.findIndex((item) => item.id === targetId)
      if (from < 0 || to < 0 || from === to) return items
      const next = [...items]
      const [moving] = next.splice(from, 1)
      next.splice(to, 0, moving)
      return next
    })
  }
  const startDragHold = (event, layer) => {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)
    setSelectedId(layer.id)
    dragState.current = { id: layer.id, pointerId, startX: event.clientX, startY: event.clientY, active: false }
    setDragUi({ holdingId: layer.id, draggingId: null })
    clearTimeout(dragTimer.current)
    dragTimer.current = setTimeout(() => {
      if (dragState.current?.pointerId !== pointerId) return
      dragState.current.active = true
      setDragUi({ holdingId: null, draggingId: layer.id })
      if (navigator.vibrate) navigator.vibrate(18)
    }, 500)
  }
  const continueDrag = (event) => {
    const state = dragState.current
    if (!state || state.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY)
    if (!state.active && distance > 10) {
      clearTimeout(dragTimer.current)
      setDragUi({ holdingId: null, draggingId: null })
      return
    }
    if (!state.active) return
    event.preventDefault()
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-layer-id]')
    if (target?.dataset.layerId) reorderLayer(state.id, target.dataset.layerId)
  }
  const finishDrag = (event) => {
    const state = dragState.current
    if (!state || state.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    clearTimeout(dragTimer.current)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragState.current = null
    setDragUi({ holdingId: null, draggingId: null })
  }
  const duplicate = (layer) => {
    const copy = { ...layer, id: `${layer.type}-${crypto.randomUUID()}`, name: `${layer.name} copy` }
    const index = layers.findIndex((item) => item.id === layer.id)
    setLayers((items) => [...items.slice(0, index + 1), copy, ...items.slice(index + 1)])
    setSelectedId(copy.id)
  }
  const remove = (layer) => {
    const index = layers.findIndex((item) => item.id === layer.id)
    const next = layers.filter((item) => item.id !== layer.id)
    setLayers(next)
    setSelectedId(next[Math.min(index, next.length - 1)]?.id)
  }

  return (
    <div className="app-shell">
      <header>
        <div className="brand"><span className="brand-mark"><i /><i /><i /></span><div><h1>Layer Light</h1><p>Window heat-flow sketchbook</p></div></div>
        <div className="model-pill"><span /> Steady-state model</div>
      </header>

      <main>
        <section className="intro">
          <div><p className="eyebrow">Build an assembly</p><h2>Where does the sunlight go?</h2><p>Stack materials from outdoors to indoors. Tune their properties and watch the balance shift.</p></div>
          <div className="conditions card">
            <NumberField label="Sunlight" value={settings.sunlight} unit="W/m²" step={10} onChange={(v) => setSettings({ ...settings, sunlight: v })} />
            <NumberField label="Outdoors" value={settings.outdoorTemp} unit="°C" step={1} onChange={(v) => setSettings({ ...settings, outdoorTemp: v })} />
            <NumberField label="Room" value={settings.indoorTemp} unit="°C" step={1} onChange={(v) => setSettings({ ...settings, indoorTemp: v })} />
          </div>
        </section>

        <section className="workspace">
          <aside className="palette card">
            <div className="section-heading"><p className="eyebrow">Materials</p><span>Click to add</span></div>
            <div className="palette-list">
              {Object.entries(MATERIALS).map(([type, material]) => (
                <button key={type} onClick={() => addLayer(type)}><i style={{ background: material.color }} /><span>{material.name}</span><b>+</b></button>
              ))}
            </div>
            <button className="reset" onClick={() => { const fresh = [newLayer('glass'), newLayer('air'), newLayer('glass'), newLayer('curtain')]; setLayers(fresh); setSelectedId(fresh[0].id) }}>Reset example</button>
          </aside>

          <section className={`stack-panel card ${flowVisible ? 'flow-expanded' : 'flow-collapsed'}`}>
            <div className="stack-labels"><span>OUTDOORS</span><button className="flow-toggle" aria-pressed={flowVisible} onClick={() => setFlowVisible((visible) => !visible)}><i /> Energy flow</button><span>ROOM</span></div>
            <div className="sun-line"><span>☀</span><i /><b>{fmt(settings.sunlight)} W/m² incident</b></div>
            {flowVisible && <EnergyRibbons layers={layers} flows={result.solarByLayer} sunlight={settings.sunlight} />}
            <div className={`layer-stack ${dragUi.draggingId ? 'stack-is-dragging' : ''}`}>
              {layers.length === 0 && <div className="empty-state">Add a material to begin</div>}
              {layers.map((layer, index) => (
                <div data-layer-id={layer.id} className={`layer-card ${selectedId === layer.id ? 'selected' : ''} ${layer.enabled === false ? 'disabled' : ''} ${dragUi.holdingId === layer.id ? 'holding' : ''} ${dragUi.draggingId === layer.id ? 'moving' : ''}`} key={layer.id} role="button" tabIndex="0" onClick={() => setSelectedId(layer.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(layer.id) }}>
                  <button className="layer-toggle" aria-label={`${layer.enabled === false ? 'Include' : 'Exclude'} ${layer.name} in calculation`} aria-pressed={layer.enabled !== false} title={layer.enabled === false ? 'Turn layer on' : 'Turn layer off'} onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id) }}><i /></button>
                  <div className="layer-swatch" style={{ background: layer.color, width: layer.kind === 'solid' ? `${Math.min(42, 17 + layer.thickness * 2)}px` : '48px' }} />
                  <span>{layer.name}</span>
                  <small>{layer.enabled === false ? 'OFF' : `${fmt(result.temperatures[index], 1)}°`}</small>
                  <button className="drag-grip" aria-label={`Hold and drag ${layer.name} to reorder`} title="Hold, then drag"
                    onPointerDown={(e) => startDragHold(e, layer)} onPointerMove={continueDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}
                    onKeyDown={(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); move(index, -1) } if (e.key === 'ArrowRight') { e.preventDefault(); move(index, 1) } }}>
                    <i /><i /><i />
                  </button>
                </div>
              ))}
            </div>
            <div className={`drag-status ${dragUi.holdingId ? 'is-holding' : ''} ${dragUi.draggingId ? 'is-moving' : ''}`} aria-live="polite">
              {dragUi.holdingId ? 'Keep holding…' : dragUi.draggingId ? 'Movable — drag to a new position, then release' : 'Hold the grip for half a second to move a layer'}
            </div>
            <div className="heat-arrow"><span>Net room heat</span><i className={result.totalGain < 0 ? 'reverse' : ''} /><strong>{fmt(Math.abs(result.totalGain))} W/m² {result.totalGain >= 0 ? 'in' : 'out'}</strong></div>
            <div className="metric-row">
              <div><span>Total room heat gain</span><strong>{fmt(result.totalGain)} <small>W/m²</small></strong></div>
              <div><span>Assembly R-value</span><strong>{fmt(result.totalR, 2)} <small>m²K/W</small></strong></div>
              <div><span>Direct solar</span><strong>{fmt(result.directSolar)} <small>W/m²</small></strong></div>
            </div>
          </section>

          <aside className="editor card">
            {selected ? <>
              <div className="section-heading"><p className="eyebrow">Selected layer</p><span>{selected.kind}</span></div>
              <input className="name-input" value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} />
              <div className="field-grid">
                <NumberField label="Thickness" value={selected.thickness} unit="mm" step={0.1} onChange={(v) => updateSelected({ thickness: Math.max(v, 0.01) })} />
                <NumberField label="Conductivity" value={selected.conductivity} unit="W/mK" step={0.01} onChange={(v) => updateSelected({ conductivity: Math.max(v, 0) })} />
                <NumberField label="Emissivity" value={selected.emissivity} unit="ε" min={0.02} max={1} step={0.01} onChange={(v) => updateSelected({ emissivity: Math.min(1, Math.max(0.02, v)) })} />
              </div>
              <div className="optical-heading"><span>Shortwave behavior</span><small>drag the point</small></div>
              <TernaryControl value={selected} onChange={updateSelected} />
              <div className="editor-actions"><button onClick={() => duplicate(selected)}>Duplicate</button><button className="danger" onClick={() => remove(selected)}>Remove</button></div>
            </> : <div className="empty-editor">Select a layer to edit its properties.</div>}
          </aside>
        </section>

        <section className="results-grid">
          <article className="card energy-card"><div className="section-heading"><div><p className="eyebrow">Solar balance</p><h3>Energy destinations</h3></div><span>per m² of window</span></div><EnergyBar result={result} sunlight={settings.sunlight} /></article>
          <article className="card notes-card"><p className="eyebrow">Reading the model</p><h3>What this version includes</h3><p>Solids conduct heat. Gaps exchange heat by gas conduction, simplified convection, and longwave radiation; vacuum gaps retain only radiation. Absorbed sunlight heats its layer and divides between outdoors and the room.</p><div className="note"><span>i</span><p>Single-band optics, linearized radiation, no edge leakage or multiple reflections. Use this to compare ideas—not size HVAC equipment.</p></div></article>
        </section>
      </main>
      <footer><span>Layer Light · exploratory thermal model</span><span>Model details in SPEC.md</span></footer>
    </div>
  )
}
