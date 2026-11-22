import { useEffect, useState } from 'react'
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
      <header><strong>{perfil?.nombre}</strong><button className="sec" style={{ width: 'auto' }} onClick={logout}>Salir</button></header>
      <div className="estado"><span>{online ? '● En línea' : '○ Sin conexión'}</span><span>{pend ? `${pend} sin subir` : 'Todo sincronizado'}</span></div>
      <main>{children}</main>
    </>
  )
}
