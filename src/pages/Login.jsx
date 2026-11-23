import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function Login() {
  const { session, login } = useAuth()
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [error, setError] = useState(''); const [cargando, setCargando] = useState(false)
  if (session) return <Navigate to="/" replace />

  async function enviar(e) {
    e.preventDefault(); setCargando(true); setError('')
    const { error } = await login(email.trim(), pass)
    if (error) setError('Email o contraseña incorrectos. Si no tenés cuenta, pedísela a tu coordinador.')
    setCargando(false)
  }

  return (
    <div className="login">
      <div className="login-card">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="Escudo" />
        <h1>Relevamiento Territorial</h1>
        <p className="nota">Acceso solo para integrantes habilitados.</p>
        <form onSubmit={enviar}>
          <label htmlFor="e">Email</label>
          <input id="e" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="p">Contraseña</label>
          <input id="p" type="password" autoComplete="current-password" required value={pass} onChange={(e) => setPass(e.target.value)} />
          {error && <p role="alert" style={{ color: 'var(--rojo)' }}>{error}</p>}
          <button style={{ marginTop: '1rem' }} disabled={cargando}>{cargando ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
      </div>
    </div>
  )
}