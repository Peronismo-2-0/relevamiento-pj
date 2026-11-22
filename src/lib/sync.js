import { supabase } from './supabase'
import { db } from './db'

let enCurso = false

// Sube pendientes. Idempotente: el id uuid se genera en el celular, así que reintentar nunca duplica.
export async function subirPendientes() {
  if (enCurso || !navigator.onLine) return
  enCurso = true
  try {
    const pend = await db.relevamientos.where('synced').equals(0).toArray()
    for (const { synced, ...r } of pend) {
      const { error } = await supabase.rpc('upsert_relevamiento', { r })
      if (error) { console.warn('sync falló', r.id, error.message); if (error.code === 'PGRST301') break; continue }
      await db.relevamientos.update(r.id, { synced: 1 })
    }
  } finally { enCurso = false }
}

// Baja zonas asignadas al usuario y las cachea.
export async function bajarZonas() {
  if (!navigator.onLine) return
  const { data, error } = await supabase.from('zonas_geojson').select('*')
  if (error) return
  await db.transaction('rw', db.zonas, async () => { await db.zonas.clear(); await db.zonas.bulkPut(data) })
}

export function iniciarSync() {
  const run = () => { subirPendientes(); bajarZonas() }
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run())
  const t = setInterval(subirPendientes, 30_000) // reintento periódico (iOS no soporta Background Sync)
  run()
  return () => { window.removeEventListener('online', run); clearInterval(t) }
}
