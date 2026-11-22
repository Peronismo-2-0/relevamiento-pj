import Dexie from 'dexie'

// IndexedDB local. `synced`: 0 = pendiente de subir, 1 = ya en la nube.
export const db = new Dexie('relevamiento')
db.version(1).stores({
  relevamientos: 'id, synced, zona_id, capturado_en',
  zonas: 'id',            // cache de zonas asignadas (para mapa offline)
  asignaciones: 'zona_id'
})
