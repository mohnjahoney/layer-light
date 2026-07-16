import { useMemo, useRef, useState } from 'react'
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
    { label: 'Reflected', value: result.reflected, color: '#d5d9c8' },
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

export default function App() {
  const [layers, setLayers] = useState(INITIAL)
  const [selectedId, setSelectedId] = useState(INITIAL[0].id)
  const [settings, setSettings] = useState({ sunlight: 700, outdoorTemp: 32, indoorTemp: 22 })
  const result = useMemo(() => solveSystem(layers, settings), [layers, settings])
  const selected = layers.find((layer) => layer.id === selectedId)

  const updateSelected = (changes) => setLayers((items) => items.map((item) => item.id === selectedId ? { ...item, ...changes } : item))
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

          <section className="stack-panel card">
            <div className="stack-labels"><span>OUTDOORS</span><span>ROOM</span></div>
            <div className="sun-line"><span>☀</span><i /><b>{fmt(settings.sunlight)} W/m²</b></div>
            <div className="layer-stack">
              {layers.length === 0 && <div className="empty-state">Add a material to begin</div>}
              {layers.map((layer, index) => (
                <div className={`layer-card ${selectedId === layer.id ? 'selected' : ''}`} key={layer.id} role="button" tabIndex="0" onClick={() => setSelectedId(layer.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(layer.id) }}>
                  <div className="layer-swatch" style={{ background: layer.color, width: layer.kind === 'solid' ? `${Math.min(42, 17 + layer.thickness * 2)}px` : '48px' }} />
                  <span>{layer.name}</span>
                  <small>{fmt(result.temperatures[index], 1)}°</small>
                  <div className="layer-actions">
                    <button title="Move left" aria-label={`Move ${layer.name} left`} onClick={(e) => { e.stopPropagation(); move(index, -1) }}>‹</button>
                    <button title="Move right" aria-label={`Move ${layer.name} right`} onClick={(e) => { e.stopPropagation(); move(index, 1) }}>›</button>
                  </div>
                </div>
              ))}
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
