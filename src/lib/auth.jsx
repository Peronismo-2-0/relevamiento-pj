import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

const PERFIL_KEY = 'perfil_cache'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [perfil, setPerfil] = useState(() => JSON.parse(localStorage.getItem(PERFIL_KEY) || 'null'))

  async function cargarPerfil(uid) {
    if (!navigator.onLine) return // sin señal: usa el perfil guardado
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', uid).maybeSingle()
    if (error) {
      alert('Error al leer tu perfil: ' + error.message + ' (código ' + error.code + ')')
      await supabase.auth.signOut()
    } else if (!data) {
      alert('Tu usuario existe, pero no tiene perfil cargado. Usuario: ' + uid)
      await supabase.auth.signOut()
    } else if (!data.activo) {
      alert('Tu cuenta está desactivada.')
      await supabase.auth.signOut()
    } else {
      setPerfil(data)
      localStorage.setItem(PERFIL_KEY, JSON.stringify(data))
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSession(s)
      if (s) setTimeout(() => cargarPerfil(s.user.id), 0)
      else { setPerfil(null); localStorage.removeItem(PERFIL_KEY) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const login = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const logout = () => supabase.auth.signOut()

  return <Ctx.Provider value={{ session, perfil, login, logout }}>{children}</Ctx.Provider>
}