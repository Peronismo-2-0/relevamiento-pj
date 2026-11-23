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
const COLOR_AFINIDAD = { verde: '#2e8b57', amarillo: '#d99a00', rojo: '#c8372d' }

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
  const [filtroZona, setFiltroZona] = useState('todas')
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
    if (filtroZona !== 'todas' && r.zona_id !== filtroZona) return false
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

  // Avance por zona: cuántos relevamientos tiene cada zona y quién los cargó
  const avancePorZona = Object.entries(zonasMap).map(([id, nombre]) => {
    const deZona = lista.filter((r) => r.zona_id === id)
    const porMilitante = {}
    deZona.forEach((r) => {
      const n = perfilesMap[r.militante_id] || '—'
      porMilitante[n] = (porMilitante[n] || 0) + 1
    })
    return { id, nombre, total: deZona.length, porMilitante }
  })
  const maxZona = Math.max(1, ...avancePorZona.map((z) => z.total))

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
    <div>
      <h2>Panel del coordinador — {JUNTAS[perfil?.junta_id] || 'Todas las juntas'}</h2>
      <p style={{ marginTop: 0, color: '#475467' }}>Hola, {perfil?.nombre}.</p>

      <div className="contadores">
        <div className="contador"><span>Total</span><strong>{conteo.total}</strong></div>
        <div className="contador verde"><span>Verde</span><strong>{conteo.verde}</strong></div>
        <div className="contador amarillo"><span>Amarillo</span><strong>{conteo.amarillo}</strong></div>
        <div className="contador rojo"><span>Rojo</span><strong>{conteo.rojo}</strong></div>
      </div>

      <h3>Avance por zona</h3>
      <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1.25rem' }}>
        {avancePorZona.length === 0 && <p>Todavía no hay zonas para mostrar.</p>}
        {avancePorZona.map((z) => (
          <div key={z.id} style={{ background: '#fff', border: '1px solid #D0D5DD', borderRadius: 8, padding: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <strong>{z.nombre}</strong>
              <strong>{z.total}</strong>
            </div>
            <div style={{ background: '#EAF2FA', borderRadius: 6, height: 12, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${(z.total / maxZona) * 100}%`, height: '100%', background: '#12294A' }} />
            </div>
            <div style={{ color: '#475467', fontSize: '.9rem', marginTop: 6 }}>
              {z.total === 0
                ? 'Sin relevamientos todavía'
                : Object.entries(z.porMilitante).map(([n, c]) => `${n}: ${c}`).join(' · ')}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div style={{ flex: '1 1 150px' }}>
          <label>Afinidad</label>
          <select value={filtroAfinidad} onChange={(e) => setFiltroAfinidad(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="verde">Verde</option>
            <option value="amarillo">Amarillo</option>
            <option value="rojo">Rojo</option>
          </select>
        </div>

        <div style={{ flex: '1 1 150px' }}>
          <label>Categoría</label>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="todas">Todas</option>
            {Object.entries(CATEGORIAS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 150px' }}>
          <label>Zona</label>
          <select value={filtroZona} onChange={(e) => setFiltroZona(e.target.value)}>
            <option value="todas">Todas</option>
            {Object.entries(zonasMap).map(([id, nombre]) => (
              <option key={id} value={id}>{nombre}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 100%' }}>
          <label>Buscar nombre o dirección</label>
          <input
            placeholder="Ej. Sarmiento, López..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <button type="button" className="sec" style={{ flex: '1 1 140px' }} onClick={cargar}>
          Actualizar
        </button>

        <button
          type="button"
          style={{ flex: '1 1 140px' }}
          disabled={!filtrados.length}
          onClick={exportarCSV}
        >
          Exportar CSV ({filtrados.length})
        </button>
      </div>

      {error && <p role="alert" style={{ color: 'var(--rojo)' }}>{error}</p>}

      <MapContainer center={CENTRO} zoom={14} className="mapa" style={{ marginBottom: '1.25rem' }}>
        <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {zonasGeo.map((z) => (
          <GeoJSON key={z.id} data={z.geojson} style={{ color: '#12294a', weight: 3, fillColor: '#74acdf', fillOpacity: 0.2 }} />
        ))}
        {puntosEnMapa.map((r) => (
          <CircleMarker
            key={r.id}
            center={r.coords}
            radius={9}
            pathOptions={{
              color: '#101828',
              weight: 2,
              fillColor: COLOR_AFINIDAD[r.afinidad] || '#12294a',
              fillOpacity: 0.95
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

      {cargando ? (
        <p>Cargando relevamientos…</p>
      ) : !filtrados.length ? (
        <p>No hay relevamientos para mostrar con esos filtros.</p>
      ) : (
        <>
          {/* Celular: fichas */}
          <div className="vista-fichas">
            {filtrados.map((r) => (
              <div key={r.id} className={`ficha ${r.afinidad}`}>
                <strong>{r.nombre}</strong>
                <div>{r.direccion}</div>
                <div style={{ color: '#475467', fontSize: '.9rem' }}>
                  {new Date(r.capturado_en).toLocaleDateString('es-AR')} · {zonasMap[r.zona_id] || '—'} · {perfilesMap[r.militante_id] || '—'}
                </div>
                {r.telefono && <div>Tel: {r.telefono}</div>}
                <span className="etiqueta">{CATEGORIAS[r.categoria] || r.categoria}</span>
                <span className="etiqueta">{AFINIDAD_LABEL[r.afinidad] || r.afinidad}</span>
                {(r.tags || []).map((t) => <span key={t} className="etiqueta">{t}</span>)}
              </div>
            ))}
          </div>

          {/* Compu: tabla */}
          <div className="vista-tabla">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Zona</th>
                  <th>Nombre</th>
                  <th>Dirección</th>
                  <th>Teléfono</th>
                  <th>Categoría</th>
                  <th>Afinidad</th>
                  <th>Militante</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.capturado_en).toLocaleDateString('es-AR')}</td>
                    <td>{zonasMap[r.zona_id] || '—'}</td>
                    <td><strong>{r.nombre}</strong></td>
                    <td>{r.direccion}</td>
                    <td>{r.telefono || '—'}</td>
                    <td>{CATEGORIAS[r.categoria] || r.categoria}</td>
                    <td>
                      <span style={{ color: COLOR_AFINIDAD[r.afinidad], fontWeight: 700 }}>● </span>
                      {AFINIDAD_LABEL[r.afinidad] || r.afinidad}
                    </td>
                    <td>{perfilesMap[r.militante_id] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}