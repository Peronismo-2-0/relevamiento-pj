import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

// Panel mínimo: alta de usuarios vía Edge Function. Siguiente paso: asignar zonas, listar relevamientos, ver auditoría.
export default function Admin() {
  const { perfil } = useAuth()
  const [f, setF] = useState({ email: '', password: '', nombre: '', rol: 'militante', junta_id: perfil?.junta_id ?? 1 })
  const [msg, setMsg] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  async function crear(e) {
    e.preventDefault(); setMsg('')
    const { error } = await supabase.functions.invoke('smooth-handler', { body: { ...f, junta_id: Number(f.junta_id) } })
    setMsg(error ? 'No se pudo crear: ' + error.message : 'Usuario creado.')
  }

  return (
    <>
      <h2>Crear cuenta</h2>
      <form onSubmit={crear}>
        <label>Nombre</label><input required value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
        <label>Email</label><input type="email" required value={f.email} onChange={(e) => set('email', e.target.value)} />
        <label>Contraseña inicial</label><input type="password" minLength={10} required value={f.password} onChange={(e) => set('password', e.target.value)} />
        <label>Rol</label>
        <select value={f.rol} onChange={(e) => set('rol', e.target.value)}>
          <option value="militante">Militante</option>
          {perfil.rol === 'super_admin' && <><option value="coordinador">Coordinador de Junta</option><option value="super_admin">Super Admin</option></>}
        </select>
        <label>Junta</label>
        <select value={f.junta_id} onChange={(e) => set('junta_id', e.target.value)} disabled={perfil.rol === 'coordinador'}>
          <option value={1}>Trinidad</option><option value={2}>Concepción</option><option value={3}>Desamparados</option><option value={4}>Capital Centro</option>
        </select>
        {msg && <p role="status">{msg}</p>}
        <p><button>Crear cuenta</button></p>
      </form>
    </>
  )
}
