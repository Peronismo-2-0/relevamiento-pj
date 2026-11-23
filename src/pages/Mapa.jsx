import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, useMapEvents } from 'react-leaflet'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { subirPendientes } from '../lib/sync'
import { CATEGORIAS, AFINIDAD, TAGS } from '../lib/constantes'

const CENTRO = [-31.5375, -68.5364] // San Juan Capital
const vacio = { nombre: '', direccion: '', telefono: '', dni: '', categoria: 'vecino', afinidad: '', observaciones: '', tags: [] }
const CLASES_AFINIDAD = ['verde', 'amarillo', 'rojo']

function Selector({ onPick }) { useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) }); return null }

// Ray casting simple para saber en qué zona asignada cae el punto (funciona offline).
function dentro([lat, lng], poly) {
  const ring = poly.coordinates[0]; let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

export default function Mapa() {
  const zonas = useLiveQuery(() => db.zonas.toArray(), [], [])
  const [punto, setPunto] = useState(null)
  const [f, setF] = useState(vacio)
  const [msg, setMsg] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const usarGPS = () => navigator.geolocation.getCurrentPosition(
    (p) => setPunto([p.coords.latitude, p.coords.longitude]),
    () => setMsg('No pude obtener el GPS. Tocá el mapa para marcar el punto.'), { enableHighAccuracy: true })
  useEffect(usarGPS, [])

  async function guardar(e) {
    e.preventDefault()
    if (!punto) return setMsg('Marcá la ubicación en el mapa.')
    if (!f.afinidad) return setMsg('Elegí el semáforo de afinidad.')
    const zona = zonas.find((z) => dentro(punto, z.geojson))
    if (!zona) return setMsg('Ese punto está fuera de tus zonas asignadas.')
    await db.relevamientos.add({
      ...f, id: crypto.randomUUID(), zona_id: zona.id, lat: punto[0], lng: punto[1],
      capturado_en: new Date().toISOString(), synced: 0
    })
    setF(vacio); setPunto(null); setMsg('Guardado en el teléfono. Se sube solo cuando haya señal.')
    subirPendientes()
  }

  return (
    <>
      <MapContainer center={CENTRO} zoom={14} className="mapa">
        <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {zonas.map((z) => <GeoJSON key={z.id} data={z.geojson} style={{ color: '#12294a', weight: 3, fillColor: '#74acdf', fillOpacity: 0.2 }} />)}
        {punto && <Marker position={punto} />}
        <Selector onPick={setPunto} />
      </MapContainer>
      <button className="sec" style={{ marginTop: '.5rem' }} onClick={usarGPS}>Usar mi ubicación GPS</button>

      <form onSubmit={guardar}>
        <label>Nombre y apellido *</label><input required value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
        <label>Calle y número *</label><input required value={f.direccion} onChange={(e) => set('direccion', e.target.value)} />
        <label>Teléfono / WhatsApp</label><input type="tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} />
        <label>DNI (opcional)</label><input inputMode="numeric" value={f.dni} onChange={(e) => set('dni', e.target.value)} />
        <label>Categoría</label>
        <select value={f.categoria} onChange={(e) => set('categoria', e.target.value)}>{CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        <label>Afinidad *</label>
        <div className="sem">{AFINIDAD.map(([v, t], i) => (
          <button type="button" key={v} className={`${CLASES_AFINIDAD[i]} ${f.afinidad === v ? 'on' : ''}`} onClick={() => set('afinidad', v)}>{t}</button>))}
        </div>
        <label>Observaciones</label><textarea rows="3" value={f.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
        <div className="tags">{TAGS.map(([v, t]) => (
          <label key={v}><input type="checkbox" checked={f.tags.includes(v)}
            onChange={(e) => set('tags', e.target.checked ? [...f.tags, v] : f.tags.filter((x) => x !== v))} />{t}</label>))}
        </div>
        {msg && <p role="status">{msg}</p>}
        <button className="guardar">Guardar relevamiento</button>
      </form>
    </>
  )
}