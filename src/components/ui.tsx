import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import type { Poliza } from '../lib/types'
import {
  claseEstado, cuotaARevisar, diasHasta, estadoVto, fmtDias, fmtFecha, gestionCerrada, requiereAccion, type EstadoVto,
} from '../lib/util'

export function Semaforo({ e }: { e: EstadoVto }) {
  return <span className={`pill ${claseEstado(e)}`}>{e}</span>
}

export function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-fondo" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="modal-cab">
          <h3>{titulo}</h3>
          <button className="icono" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ordenarPorVto(a: Poliza, b: Poliza) {
  if (!a.vence && !b.vence) return a.id - b.id
  if (!a.vence) return 1
  if (!b.vence) return -1
  return a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0
}

export function PolizaFila({ p, mostrarRubro = true }: { p: Poliza; mostrarRubro?: boolean }) {
  const s = useStore()
  const c = p.cliente_id ? s.cliente.get(p.cliente_id) : undefined
  const a = p.aseguradora_id ? s.aseguradora.get(p.aseguradora_id) : undefined
  const r = p.rubro_id ? s.rubro.get(p.rubro_id) : undefined
  const its = s.itemsDe.get(p.id) ?? []
  const e = estadoVto(p, s.config)
  const accion = requiereAccion(p, s.config)
  const cuota = cuotaARevisar(p, s.config)
  const cerrada = gestionCerrada(p, s.config)
  const detalle = its.length > 1
    ? `${p.detalle ?? 'Flota'} · ${its.length} vehículos`
    : its.length === 1 ? [its[0].detalle, its[0].patente].filter(Boolean).join(' · ') : p.detalle
  return (
    <Link to={`/poliza/${p.id}`} className={`poliza-fila borde-${p.estado === 'baja' ? 'gris' : claseEstado(e)}`}>
      <div className="pf-principal">
        <div className="pf-nombre">{c?.nombre ?? 'Sin asegurado'}</div>
        <div className="pf-sub">
          {[a?.nombre, mostrarRubro ? r?.nombre : null, p.numero ? `Nº ${p.numero}` : p.datos?.en_tramite ? 'En trámite' : null]
            .filter(Boolean).join(' · ')}
        </div>
        {detalle && <div className="pf-detalle">{detalle}</div>}
        <div className="pf-tags">
          {accion && <span className="tag accion">Renov. {p.renovacion}</span>}
          {cuota && <span className="tag cuota">Cuota: {p.estado_cuota ?? `vence ${fmtFecha(p.prox_vto_cuota)}`}</span>}
          {p.gestion && p.gestion !== 'Sin gestionar' && <span className={`tag ${cerrada ? 'ok' : 'gestion'}`}>{p.gestion}</span>}
          {p.revisar && <span className="tag revisar" title={p.revisar}>Para completar</span>}
          {p.estado === 'baja' && <span className="tag">{p.baja_motivo ?? 'Baja'}</span>}
        </div>
      </div>
      <div className="pf-vto">
        {p.estado === 'activa' && <Semaforo e={e} />}
        <div className="pf-fecha">{fmtFecha(p.estado === 'baja' ? p.baja_fecha ?? p.vence : p.vence)}</div>
        {p.vence && p.estado === 'activa' && <div className="pf-dias">{fmtDias(diasHasta(p.vence))}</div>}
      </div>
    </Link>
  )
}

/** Lista con paginado simple (para no dibujar 900 filas de golpe en el celular). */
export function ListaPolizas({ polizas, vacio = 'No hay pólizas para mostrar.', mostrarRubro = true }:
  { polizas: Poliza[]; vacio?: string; mostrarRubro?: boolean }) {
  const [limite, setLimite] = useState(60)
  useEffect(() => setLimite(60), [polizas])
  if (!polizas.length) return <p className="vacio">{vacio}</p>
  return (
    <div className="lista">
      {polizas.slice(0, limite).map((p) => <PolizaFila key={p.id} p={p} mostrarRubro={mostrarRubro} />)}
      {polizas.length > limite && (
        <button className="secundario ancho" onClick={() => setLimite(limite + 100)}>
          Ver más ({polizas.length - limite} restantes)
        </button>
      )}
    </div>
  )
}

/** Agrupa por rubro y, dentro, por aseguradora. */
export function ListaAgrupada({ polizas, vacio }: { polizas: Poliza[]; vacio?: string }) {
  const s = useStore()
  const grupos = useMemo(() => {
    const m = new Map<string, Map<string, Poliza[]>>()
    for (const p of polizas) {
      const r = s.rubro.get(p.rubro_id ?? -1)?.nombre ?? 'Sin rubro'
      const a = s.aseguradora.get(p.aseguradora_id ?? -1)?.nombre ?? 'Sin compañía'
      if (!m.has(r)) m.set(r, new Map())
      const g = m.get(r)!
      g.set(a, [...(g.get(a) ?? []), p])
    }
    const orden = new Map(s.rubros.map((r) => [r.nombre, r.orden]))
    return [...m.entries()].sort((x, y) => (orden.get(x[0]) ?? 99) - (orden.get(y[0]) ?? 99))
      .map(([r, g]) => [r, [...g.entries()].sort((x, y) => x[0].localeCompare(y[0]))] as const)
  }, [polizas, s])
  if (!polizas.length) return <p className="vacio">{vacio ?? 'Nada por acá.'}</p>
  return (
    <div>
      {grupos.map(([r, gs]) => (
        <section key={r} className="grupo">
          <h3 className="grupo-titulo">{r} <span className="cuenta">{gs.reduce((n, g) => n + g[1].length, 0)}</span></h3>
          {gs.map(([a, ps]) => (
            <div key={a}>
              <h4 className="subgrupo">{a} <span className="cuenta">{ps.length}</span></h4>
              <div className="lista">{[...ps].sort(ordenarPorVto).map((p) => <PolizaFila key={p.id} p={p} mostrarRubro={false} />)}</div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

export function Chips<T extends string | number>({ opciones, valor, onChange }:
  { opciones: { v: T; label: string; n?: number }[]; valor: T; onChange: (v: T) => void }) {
  return (
    <div className="chips" role="tablist">
      {opciones.map((o) => (
        <button key={String(o.v)} role="tab" aria-selected={o.v === valor} className={`chip ${o.v === valor ? 'activo' : ''}`}
          onClick={() => onChange(o.v)}>
          {o.label}{o.n != null && <span className="chip-n">{o.n}</span>}
        </button>
      ))}
    </div>
  )
}
