import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth.jsx'
import { iniciarSync } from './lib/sync'
import Login from './pages/Login.jsx'
import Mapa from './pages/Mapa.jsx'
import Admin from './pages/Admin.jsx'
import Coordinador from './pages/Coordinador.jsx'
import Shell from './components/Shell.jsx'

function Protegida({ roles, children }) {
  const { session, perfil } = useAuth()
  if (session === undefined) return <p style={{ padding: '1rem' }}>Cargando…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!perfil) return <p style={{ padding: '1rem' }}>Cargando perfil…</p>
  if (roles && !roles.includes(perfil.rol)) return <Navigate to="/" replace />
  return <Shell>{children}</Shell>
}

function Inicio() {
  const { perfil } = useAuth()
  const destino =
    perfil?.rol === 'super_admin' ? '/admin'
    : perfil?.rol === 'coordinador' ? '/coordinador'
    : '/mapa'
  return <Navigate to={destino} replace />
}

export default function App() {
  const { session } = useAuth()
  useEffect(() => (session ? iniciarSync() : undefined), [session])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/mapa" element={<Protegida><Mapa /></Protegida>} />
      <Route path="/admin" element={<Protegida roles={['super_admin']}><Admin /></Protegida>} />
      <Route path="/coordinador" element={<Protegida roles={['super_admin', 'coordinador']}><Coordinador /></Protegida>} />
      <Route path="*" element={<Protegida><Inicio /></Protegida>} />
    </Routes>
  )
}