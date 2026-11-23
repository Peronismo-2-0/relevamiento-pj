import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { db } from '../lib/db'

export default function Shell({ children }) {
  const { perfil, logout } = useAuth()
  const [online, setOnline] = useState(navigator.onLine)
  const [pend, setPend] = useState(0)

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    const t = setInterval(async () => setPend(await db.relevamientos.where('synced').equals(0).count()), 2000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t) }
  }, [])

  return (
    <>
      <header>
        <div className="marca">
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="Escudo" />
          <strong>{perfil?.nombre}</strong>
        </div>
        <button onClick={logout}>Salir</button>
      </header>
      <div className="estado">
        <span className={online ? 'pill' : 'pill off'}>{online ? '● En línea' : '● Guardado local'}</span>
        <span>{pend ? `${pend} sin subir` : 'Todo sincronizado'}</span>
      </div>
      {(perfil?.rol === 'super_admin' || perfil?.rol === 'coordinador') && (
        <nav className="nav">
          {perfil.rol === 'super_admin' && <NavLink to="/admin">Crear cuentas</NavLink>}
          <NavLink to="/coordinador">Panel</NavLink>
          <NavLink to="/mapa">Formulario</NavLink>
        </nav>
      )}
      <main>{children}</main>
    </>
  )
}