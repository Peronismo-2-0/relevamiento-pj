import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup } from 'react-leaflet'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

const CENTRO = [-31.5375, -68.5364] // San Juan Capital
const JUNTAS = { 1: 'Trinidad', 2: 'Concepción', 3: 'Desamparados', 4: 'Capital Centro' }
const CATEGORIAS = {
  vecino: 'Vecino',
  union_vecinal: 'Unión Vecinal',
  club_deportivo: 'Club Deportivo',
  centro_jubilados: 'Centro de Jubilados',
  comercio_referente: 'Comercio Referente'
}
const AFINIDAD_LABEL = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' }
const COLOR_AFINIDAD = { verde: '#16a34a', amarillo: '#eab308', rojo: '#dc2626' }

// Extrae [lat, lng] si geom viene en formato GeoJSON { type: 'Point', coordinates: [lng, lat] }
function extraerLatLng(geom) {
  if (!geom) return null
  if (typeof geom === 'object' && geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    const [lng, lat] = geom.coordinates
    if (typeof lat === 'number' && typeof lng === 'number') return [lat, lng]
  }
  return null
}

export default function Coordinador() {
  const { perfil } = useAuth()
  const [lista, setLista] = useState([])
  const [zonasGeo, setZonasGeo] = useState([])
  const [zonasMap, setZonasMap] = useState({})
  const [perfilesMap, setPerfilesMap] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtroAfinidad, setFiltroAfinidad] = useState('todas')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [busqueda, setBusqueda] = useState('')

  async function cargar() {
    setCargando(true)
    setError('')
    const [resRel, resZonasGeo, resPerf] = await Promise.all([
      supabase
        .from('relevamientos')
        .select('id, militante_id, zona_id, geom, nombre, direccion, telefono, dni, categoria, afinidad, observaciones, tags, capturado_en')
        .order('capturado_en', { ascending: false }),
      supabase.from('zonas_geojson').select('id, nombre, geojson'),
      supabase.from('perfiles').select('id, nombre')
    ])

    if (resRel.error) {
      setError('Error al cargar relevamientos: ' + resRel.error.message)
      setCargando(false)
      return
    }

    const zList = resZonasGeo.data || []
    const zMap = {}
    zList.forEach((z) => { zMap[z.id] = z.nombre })

    const pMap = {}
    ;(resPerf.data || []).forEach((p) => { pMap[p.id] = p.nombre })

    setZonasGeo(zList)
    setZonasMap(zMap)
    setPerfilesMap(pMap)
    setLista(resRel.data || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const filtrados = lista.filter((r) => {
    if (filtroAfinidad !== 'todas' && r.afinidad !== filtroAfinidad) return false
    if (filtroCategoria !== 'todas' && r.categoria !== filtroCategoria) return false
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      const texto = `${r.nombre} ${r.direccion} ${r.observaciones || ''}`.toLowerCase()
      if (!texto.includes(q)) return false
    }
    return true
  })

  const puntosEnMapa = filtrados
    .map((r) => ({ ...r, coords: extraerLatLng(r.geom) }))
    .filter((r) => r.coords !== null)

  const conteo = {
    total: lista.length,
    verde: lista.filter((r) => r.afinidad === 'verde').length,
    amarillo: lista.filter((r) => r.afinidad === 'amarillo').length,
    rojo: lista.filter((r) => r.afinidad === 'rojo').length
  }

  async function exportarCSV() {
    if (!filtrados.length) return

    const { error: audErr } = await supabase.rpc('log_audit', {
      p_accion: 'relevamientos.exportar',
      p_detalle: {
        junta_id: perfil?.junta_id ?? null,
        cantidad: filtrados.length,
        filtro_afinidad: filtroAfinidad,
        filtro_categoria: filtroCategoria
      }
    })

    if (audErr) {
      setError('No se pudo registrar la auditoría de exportación: ' + audErr.message)
      return
    }

    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const encabezados = [
      'Fecha captura',
      'Junta',
      'Zona',
      'Militante',
      'Nombre',
      'Dirección',
      'Teléfono',
      'DNI',
      'Categoría',
      'Afinidad',
      'Tags',
      'Observaciones'
    ]

    const filas = filtrados.map((r) => [
      new Date(r.capturado_en).toLocaleString('es-AR'),
      JUNTAS[perfil?.junta_id] || 'Todas',
      zonasMap[r.zona_id] || '',
      perfilesMap[r.militante_id] || '',
      r.nombre,
      r.direccion,
      r.telefono || '',
      r.dni || '',
      CATEGORIAS[r.categoria] || r.categoria,
      AFINIDAD_LABEL[r.afinidad] || r.afinidad,
      (r.tags || []).join(', '),
      r.observaciones || ''
    ].map(esc).join(';'))

    const csv = '\uFEFF' + [encabezados.map(esc).join(';'), ...filas].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fecha = new Date().toISOString().slice(0, 10)
    a.download = `relevamiento_${(JUNTAS[perfil?.junta_id] || 'capital').toLowerCase()}_${fecha}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 960, margin: '0 auto' }}>
      <h2>Panel del coordinador — {JUNTAS[perfil?.junta_id] || 'Todas las juntas'}</h2>
      <p style={{ marginTop: 0, color: '#555' }}>Hola, {perfil?.nombre}.</p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ padding: '0.6rem 1rem', border: '1px solid #ddd', borderRadius: 6 }}>
          <strong>Total:</strong> {conteo.total}
        </div>
        <div style={{ padding: '0.6rem 1rem', border: '1px solid #b7e1cd', background: '#f1fbf5', borderRadius: 6 }}>
          <strong>Verde:</strong> {conteo.verde}
        </div>
        <div style={{ padding: '0.6rem 1rem', border: '1px solid #fce8b2', background: '#fefbf0', borderRadius: 6 }}>
          <strong>Amarillo:</strong> {conteo.amarillo}
        </div>
        <div style={{ padding: '0.6rem 1rem', border: '1px solid #f4c7c3', background: '#fdf3f2', borderRadius: 6 }}>
          <strong>Rojo:</strong> {conteo.rojo}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem' }}>Afinidad</label>
          <select value={filtroAfinidad} onChange={(e) => setFiltroAfinidad(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="verde">Verde</option>
            <option value="amarillo">Amarillo</option>
            <option value="rojo">Rojo</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem' }}>Categoría</label>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="todas">Todas</option>
            {Object.entries(CATEGORIAS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem' }}>Buscar nombre o dirección</label>
          <input
            placeholder="Ej. Sarmiento, López..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <button type="button" className="sec" style={{ width: 'auto' }} onClick={cargar}>
          Actualizar
        </button>

        <button
          type="button"
          style={{ width: 'auto' }}
          disabled={!filtrados.length}
          onClick={exportarCSV}
        >
          Exportar CSV ({filtrados.length})
        </button>
      </div>

      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      <div style={{ height: 380, width: '100%', marginBottom: '1.25rem', borderRadius: 8, overflow: 'hidden', border: '1px solid #ccc' }}>
        <MapContainer center={CENTRO} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {zonasGeo.map((z) => (
            <GeoJSON key={z.id} data={z.geojson} style={{ color: '#0b5fa5', weight: 2, fillOpacity: 0.08 }} />
          ))}
          {puntosEnMapa.map((r) => (
            <CircleMarker
              key={r.id}
              center={r.coords}
              radius={8}
              pathOptions={{
                color: '#111827',
                weight: 1.5,
                fillColor: COLOR_AFINIDAD[r.afinidad] || '#0b5fa5',
                fillOpacity: 0.9
              }}
            >
              <Popup>
                <strong>{r.nombre}</strong><br />
                {r.direccion}<br />
                Afinidad: <strong>{AFINIDAD_LABEL[r.afinidad] || r.afinidad}</strong><br />
                Militante: {perfilesMap[r.militante_id] || '—'}<br />
                Fecha: {new Date(r.capturado_en).toLocaleDateString('es-AR')}
                {r.observaciones ? <><br />Obs: {r.observaciones}</> : null}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {cargando ? (
        <p>Cargando relevamientos…</p>
      ) : !filtrados.length ? (
        <p>No hay relevamientos para mostrar con esos filtros.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Fecha</th>
                <th style={{ padding: '0.5rem' }}>Zona</th>
                <th style={{ padding: '0.5rem' }}>Nombre</th>
                <th style={{ padding: '0.5rem' }}>Dirección</th>
                <th style={{ padding: '0.5rem' }}>Teléfono</th>
                <th style={{ padding: '0.5rem' }}>Categoría</th>
                <th style={{ padding: '0.5rem' }}>Afinidad</th>
                <th style={{ padding: '0.5rem' }}>Militante</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>
                    {new Date(r.capturado_en).toLocaleDateString('es-AR')}
                  </td>
                  <td style={{ padding: '0.5rem' }}>{zonasMap[r.zona_id] || '—'}</td>
                  <td style={{ padding: '0.5rem' }}><strong>{r.nombre}</strong></td>
                  <td style={{ padding: '0.5rem' }}>{r.direccion}</td>
                  <td style={{ padding: '0.5rem' }}>{r.telefono || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{CATEGORIAS[r.categoria] || r.categoria}</td>
                  <td style={{ padding: '0.5rem' }}>{AFINIDAD_LABEL[r.afinidad] || r.afinidad}</td>
                  <td style={{ padding: '0.5rem' }}>{perfilesMap[r.militante_id] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}