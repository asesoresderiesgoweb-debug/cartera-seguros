import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { backend } from './lib/backend'
import type { Aseguradora, Cliente, Config, Datos, Id, Item, Poliza, Rubro, Tabla, Usuario } from './lib/types'
import { norm, soloDigitos } from './lib/util'

interface Indices {
  cliente: Map<Id, Cliente>
  aseguradora: Map<Id, Aseguradora>
  rubro: Map<Id, Rubro>
  poliza: Map<Id, Poliza>
  itemsDe: Map<Id, Item[]>
  polizasDe: Map<Id, Poliza[]>
  textoPoliza: Map<Id, string>
}

interface Store extends Datos, Indices {
  email: string
  esAdmin: boolean
  recargar(): Promise<void>
  guardarPoliza(p: Partial<Poliza>, items?: Partial<Item>[]): Promise<Poliza>
  guardarCliente(c: Partial<Cliente>): Promise<Cliente>
  guardar<T extends { id?: unknown }>(tabla: Tabla, fila: T): Promise<T>
  borrar(tabla: Tabla, id: Id | string): Promise<void>
  guardarConfig(c: Config): Promise<void>
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('sin store')
  return s
}

const clave: Record<Tabla, keyof Datos> = {
  rubros: 'rubros', aseguradoras: 'aseguradoras', clientes: 'clientes', polizas: 'polizas',
  poliza_items: 'items', usuarios: 'usuarios', biblioteca: 'biblioteca',
}

export function StoreProvider({ email, children }: { email: string; children: ReactNode }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      await backend.rpc('mantenimiento').catch(() => 0)
      setDatos(await backend.cargarTodo())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => { recargar() }, [recargar])

  const indices = useMemo<Indices | null>(() => {
    if (!datos) return null
    const cliente = new Map(datos.clientes.map((c) => [c.id, c]))
    const aseguradora = new Map(datos.aseguradoras.map((a) => [a.id, a]))
    const rubro = new Map(datos.rubros.map((r) => [r.id, r]))
    const poliza = new Map(datos.polizas.map((p) => [p.id, p]))
    const itemsDe = new Map<Id, Item[]>()
    for (const it of datos.items) {
      const l = itemsDe.get(it.poliza_id) ?? []
      l.push(it)
      itemsDe.set(it.poliza_id, l)
    }
    const polizasDe = new Map<Id, Poliza[]>()
    const textoPoliza = new Map<Id, string>()
    for (const p of datos.polizas) {
      if (p.cliente_id != null) {
        const l = polizasDe.get(p.cliente_id) ?? []
        l.push(p)
        polizasDe.set(p.cliente_id, l)
      }
      const c = p.cliente_id != null ? cliente.get(p.cliente_id) : undefined
      const its = itemsDe.get(p.id) ?? []
      textoPoliza.set(p.id, [
        norm(c?.nombre), soloDigitos(c?.doc), norm(p.numero), soloDigitos(p.numero), norm(p.detalle),
        ...its.map((i) => `${norm(i.patente)} ${norm(i.detalle)}`),
      ].join(' | '))
    }
    return { cliente, aseguradora, rubro, poliza, itemsDe, polizasDe, textoPoliza }
  }, [datos])

  const reemplazar = useCallback(<K extends keyof Datos>(k: K, fila: { id?: unknown; email?: unknown }, quitar = false) => {
    setDatos((d) => {
      if (!d) return d
      const lista = d[k] as unknown as { id?: unknown; email?: unknown }[]
      const igual = (x: { id?: unknown; email?: unknown }) => (k === 'usuarios' ? x.email === fila.email : x.id === fila.id)
      const nueva = quitar ? lista.filter((x) => !igual(x)) : lista.some(igual) ? lista.map((x) => (igual(x) ? fila : x)) : [...lista, fila]
      return { ...d, [k]: nueva }
    })
  }, [])

  const guardar = useCallback(async <T extends { id?: unknown }>(tabla: Tabla, fila: T) => {
    const g = await backend.guardar(tabla, fila)
    reemplazar(clave[tabla], g as { id?: unknown })
    return g
  }, [reemplazar])

  const borrar = useCallback(async (tabla: Tabla, id: Id | string) => {
    await backend.borrar(tabla, id)
    reemplazar(clave[tabla], tabla === 'usuarios' ? { email: id } : { id }, true)
  }, [reemplazar])

  const guardarPoliza = useCallback(async (p: Partial<Poliza>, items?: Partial<Item>[]) => {
    const g = await guardar('polizas', p as Poliza)
    if (items) {
      const previos = datos?.items.filter((i) => i.poliza_id === g.id) ?? []
      const conservar = new Set(items.map((i) => i.id).filter(Boolean))
      for (const v of previos) if (!conservar.has(v.id)) await borrar('poliza_items', v.id)
      for (const it of items) {
        if (!it.patente && !it.detalle) continue
        await guardar('poliza_items', { datos: {}, ...it, poliza_id: g.id } as Item)
      }
    }
    return g
  }, [guardar, borrar, datos])

  const guardarCliente = useCallback((c: Partial<Cliente>) => guardar('clientes', c as Cliente), [guardar])

  const guardarConfig = useCallback(async (c: Config) => {
    await backend.guardarConfig(c)
    setDatos((d) => (d ? { ...d, config: c } : d))
  }, [])

  if (error) {
    return (
      <div className="centro">
        <div className="tarjeta" style={{ maxWidth: 420 }}>
          <h2>No se pudieron cargar los datos</h2>
          <p className="sutil">{error}</p>
          <p className="sutil">Si el mensaje habla de permisos, tu mail todavía no está autorizado: pedile a la administradora que te agregue.</p>
          <div className="fila-botones">
            <button onClick={recargar}>Reintentar</button>
            <button className="secundario" onClick={() => backend.salir()}>Salir</button>
          </div>
        </div>
      </div>
    )
  }
  if (!datos || !indices) return <div className="centro"><div className="cargando">Cargando cartera…</div></div>

  const yo = datos.usuarios.find((u: Usuario) => u.email.toLowerCase() === email.toLowerCase())
  const value: Store = {
    ...datos, ...indices, email, esAdmin: backend.demo || yo?.rol === 'admin',
    recargar, guardar, borrar, guardarPoliza, guardarCliente, guardarConfig,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
