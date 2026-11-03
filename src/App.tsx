import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { backend, faltaConfiguracion } from './lib/backend'
import { StoreProvider, useStore } from './store'
import { resumir } from './lib/avisos'
import Panel from './pages/Panel'
import Avisos from './pages/Avisos'
import Cartera from './pages/Cartera'
import Buscar from './pages/Buscar'
import ClientePage from './pages/Cliente'
import PolizaPage from './pages/Poliza'
import PolizaForm from './pages/PolizaForm'
import Historico from './pages/Historico'
import Configuracion from './pages/Configuracion'

function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try { await backend.entrar(email.trim(), clave) } catch (err) { setError((err as Error).message) }
    setEnviando(false)
  }
  return (
    <div className="centro">
      <form className="tarjeta login" onSubmit={enviar}>
        <img src="icon.svg" alt="" width={48} height={48} />
        <h1>Cartera de Seguros</h1>
        {backend.demo && <p className="aviso-demo">Modo demostración: entrá con cualquier mail.</p>}
        <label>Mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {!backend.demo && (
          <label>Contraseña<input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required /></label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

function Cabecera() {
  const nav = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!loc.pathname.startsWith('/buscar')) setQ('')
  }, [loc.pathname])
  return (
    <header className="cabecera">
      <NavLink to="/" className="marca" aria-label="Inicio"><img src="icon.svg" alt="" width={28} height={28} /><span>Cartera</span></NavLink>
      <input className="buscador" type="search" placeholder="Buscar nombre, DNI, póliza, patente" value={q}
        onChange={(e) => {
          setQ(e.target.value)
          nav(`/buscar?q=${encodeURIComponent(e.target.value)}`, { replace: loc.pathname.startsWith('/buscar') })
        }} />
    </header>
  )
}

function Navegacion() {
  const s = useStore()
  const n = useMemo(() => {
    const r = resumir(s.polizas, s.config)
    return r.vencidas.length + r.porVencer.length
  }, [s.polizas, s.config])
  const item = (to: string, ico: string, txt: string, badge?: number) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'activo' : ''}`}>
      <span className="nav-ico" aria-hidden>{ico}</span>
      <span className="nav-txt">{txt}</span>
      {!!badge && <span className="badge">{badge}</span>}
    </NavLink>
  )
  return (
    <nav className="navegacion">
      {item('/', '⌂', 'Inicio')}
      {item('/avisos', '🔔', 'Avisos', n)}
      {item('/cartera', '▤', 'Cartera')}
      {item('/poliza/nueva', '＋', 'Nueva')}
      {item('/historico', '🗄', 'Histórico')}
      {item('/config', '⚙', 'Ajustes')}
    </nav>
  )
}

function FormConClave() {
  const loc = useLocation()
  return <PolizaForm key={loc.pathname + loc.search} />
}

function Aplicacion() {
  return (
    <div className="app">
      <Cabecera />
      <Navegacion />
      <main className="contenido">
        <Routes>
          <Route path="/" element={<Panel />} />
          <Route path="/avisos" element={<Avisos />} />
          <Route path="/cartera" element={<Cartera />} />
          <Route path="/buscar" element={<Buscar />} />
          <Route path="/cliente/:id" element={<ClientePage />} />
          <Route path="/poliza/nueva" element={<FormConClave />} />
          <Route path="/poliza/:id/editar" element={<FormConClave />} />
          <Route path="/poliza/:id" element={<PolizaPage />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/config" element={<Configuracion />} />
          <Route path="*" element={<Panel />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    backend.sesion().then(setEmail)
    return backend.alCambiarSesion(setEmail)
  }, [])
  if (faltaConfiguracion) {
    return <div className="centro"><div className="tarjeta"><h2>Falta configurar la conexión</h2>
      <p className="sutil">Cargá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver GUIA_INSTALACION.md).</p></div></div>
  }
  if (email === undefined) return <div className="centro"><div className="cargando">Cargando…</div></div>
  if (!email) return <Login />
  return (
    <HashRouter>
      <StoreProvider email={email}>
        <Aplicacion />
      </StoreProvider>
    </HashRouter>
  )
}
