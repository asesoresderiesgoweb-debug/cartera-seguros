import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CONFIG_DEFECTO, type Config, type Datos, type Tabla } from './types'

/** Todo el acceso a datos pasa por acá. Hay dos implementaciones:
 *  - Supabase (la real)
 *  - Demo: datos de /demo-data.json en memoria, para probar sin base. */
export interface Backend {
  demo: boolean
  sesion(): Promise<string | null>
  alCambiarSesion(cb: (email: string | null) => void): () => void
  entrar(email: string, clave: string): Promise<void>
  salir(): Promise<void>
  cargarTodo(): Promise<Datos>
  guardar<T extends { id?: unknown }>(tabla: Tabla, fila: T): Promise<T>
  borrar(tabla: Tabla, id: number | string): Promise<void>
  guardarConfig(cfg: Config): Promise<void>
  insertarLote(tabla: Tabla, filas: object[]): Promise<void>
  rpc(nombre: 'mantenimiento' | 'reiniciar_secuencias' | 'vaciar_cartera'): Promise<unknown>
}

// ------------------------------------------------------------------ Supabase

function supabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })

  async function todo<T>(tabla: string, orden = 'id'): Promise<T[]> {
    const out: T[] = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb.from(tabla).select('*').order(orden).range(desde, desde + 999)
      if (error) throw new Error(`${tabla}: ${error.message}`)
      out.push(...(data as T[]))
      if (!data || data.length < 1000) return out
    }
  }

  return {
    demo: false,
    async sesion() {
      const { data } = await sb.auth.getSession()
      return data.session?.user.email ?? null
    },
    alCambiarSesion(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s?.user.email ?? null))
      return () => data.subscription.unsubscribe()
    },
    async entrar(email, clave) {
      const { error } = await sb.auth.signInWithPassword({ email, password: clave })
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Mail o contraseña incorrectos' : error.message)
    },
    async salir() {
      await sb.auth.signOut()
    },
    async cargarTodo() {
      const [cfg, rubros, aseguradoras, clientes, polizas, items, usuarios, biblioteca] = await Promise.all([
        sb.from('config').select('valores').eq('id', 1).maybeSingle(),
        todo('rubros', 'orden'), todo('aseguradoras', 'nombre'), todo('clientes'), todo('polizas'),
        todo('poliza_items'), todo('usuarios', 'email'), todo('biblioteca'),
      ])
      if (cfg.error) throw new Error(cfg.error.message)
      return {
        config: { ...CONFIG_DEFECTO, ...(cfg.data?.valores ?? {}) },
        rubros, aseguradoras, clientes, polizas, items, usuarios, biblioteca,
      } as Datos
    },
    async guardar(tabla, fila) {
      const limpia = { ...fila } as Record<string, unknown>
      delete limpia.updated_at
      delete limpia.updated_by
      delete limpia.created_at
      if (limpia.id == null) delete limpia.id
      const { data, error } = await sb.from(tabla).upsert(limpia).select().single()
      if (error) throw new Error(error.message)
      return data as typeof fila
    },
    async borrar(tabla, id) {
      const col = tabla === 'usuarios' ? 'email' : 'id'
      const { error } = await sb.from(tabla).delete().eq(col, id)
      if (error) throw new Error(error.message)
    },
    async guardarConfig(cfg) {
      const { error } = await sb.from('config').upsert({ id: 1, valores: cfg })
      if (error) throw new Error(error.message)
    },
    async insertarLote(tabla, filas) {
      for (let i = 0; i < filas.length; i += 500) {
        const { error } = await sb.from(tabla).insert(filas.slice(i, i + 500))
        if (error) throw new Error(`${tabla}: ${error.message}`)
      }
    },
    async rpc(nombre) {
      const { data, error } = await sb.rpc(nombre)
      if (error) throw new Error(error.message)
      return data
    },
  }
}

// ------------------------------------------------------------------ Demo

function demoBackend(): Backend {
  let email: string | null = sessionStorage.getItem('demo-email')
  const oyentes = new Set<(e: string | null) => void>()
  let datos: Datos | null = null
  let sig = 1_000_000
  const avisar = () => oyentes.forEach((f) => f(email))

  return {
    demo: true,
    async sesion() { return email },
    alCambiarSesion(cb) { oyentes.add(cb); return () => oyentes.delete(cb) },
    async entrar(e) {
      email = e || 'demo@demo'
      try { sessionStorage.setItem('demo-email', email) } catch { /* sin storage */ }
      avisar()
    },
    async salir() {
      email = null
      try { sessionStorage.removeItem('demo-email') } catch { /* sin storage */ }
      avisar()
    },
    async cargarTodo() {
      if (!datos) {
        const r = await fetch('demo-data.json')
        if (!r.ok) throw new Error('No se encontró demo-data.json')
        const j = await r.json()
        datos = {
          config: { ...CONFIG_DEFECTO }, rubros: j.rubros, aseguradoras: j.aseguradoras, clientes: j.clientes,
          polizas: j.polizas.map((p: object) => ({ renovada_de: null, ...p })), items: j.poliza_items,
          usuarios: [{ email: email ?? 'demo@demo', nombre: 'Demo', rol: 'admin' }], biblioteca: j.biblioteca ?? [],
        }
      }
      return structuredClone(datos)
    },
    async guardar(tabla, fila) {
      const f = { ...fila } as Record<string, unknown>
      if (f.id == null && tabla !== 'usuarios') f.id = sig++
      const lista = (datos as unknown as Record<string, Record<string, unknown>[]>)[tabla === 'poliza_items' ? 'items' : tabla]
      const key = tabla === 'usuarios' ? 'email' : 'id'
      const i = lista.findIndex((x) => x[key] === f[key])
      if (i >= 0) lista[i] = f
      else lista.push(f)
      return f as typeof fila
    },
    async borrar(tabla, id) {
      const k = tabla === 'poliza_items' ? 'items' : tabla
      const d = datos as unknown as Record<string, Record<string, unknown>[]>
      d[k] = d[k].filter((x) => x[tabla === 'usuarios' ? 'email' : 'id'] !== id)
    },
    async guardarConfig(cfg) { if (datos) datos.config = cfg },
    async insertarLote() { throw new Error('En modo demo no se hace carga inicial') },
    async rpc() { return 0 },
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const esDemo = !!import.meta.env.VITE_DEMO
export const faltaConfiguracion = !esDemo && (!url || !key)
export const backend: Backend = esDemo ? demoBackend() : supabaseBackend(url || 'http://localhost', key || 'x')
