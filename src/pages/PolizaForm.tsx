import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import type { Aseguradora, Campo, Cliente, Item, Poliza } from '../lib/types'
import { norm, soloDigitos, sumarMeses } from '../lib/util'

function ClienteSelector({ valor, onChange, nuevo, setNuevo }: {
  valor: Cliente | null
  onChange: (c: Cliente | null) => void
  nuevo: Partial<Cliente> | null
  setNuevo: (c: Partial<Cliente> | null) => void
}) {
  const s = useStore()
  const [q, setQ] = useState('')
  const sugerencias = useMemo(() => {
    const t = norm(q).trim()
    if (t.length < 2) return []
    const d = soloDigitos(q)
    return s.clientes.filter((c) => (d.length >= 4 ? soloDigitos(c.doc).includes(d) : t.split(/\s+/).every((w) => norm(c.nombre).includes(w)))).slice(0, 8)
  }, [q, s.clientes])

  if (valor) {
    return (
      <div className="cliente-elegido">
        <div><strong>{valor.nombre}</strong><div className="sutil">{[valor.doc, valor.telefono, valor.mail].filter(Boolean).join(' · ')}</div></div>
        <button type="button" className="mini" onClick={() => onChange(null)}>Cambiar</button>
      </div>
    )
  }
  if (nuevo) {
    return (
      <div className="cliente-nuevo">
        <div className="titulo-fila"><strong>Cliente nuevo</strong><button type="button" className="mini" onClick={() => setNuevo(null)}>Buscar existente</button></div>
        <label>Nombre o razón social<input value={nuevo.nombre ?? ''} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required /></label>
        <div className="dos">
          <label>DNI / CUIT<input value={nuevo.doc ?? ''} onChange={(e) => setNuevo({ ...nuevo, doc: e.target.value || null })} /></label>
          <label>Teléfono<input type="tel" value={nuevo.telefono ?? ''} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value || null })} /></label>
        </div>
        <label>Mail<input type="email" value={nuevo.mail ?? ''} onChange={(e) => setNuevo({ ...nuevo, mail: e.target.value || null })} /></label>
      </div>
    )
  }
  return (
    <div className="autocompletar">
      <input placeholder="Escribí nombre o DNI/CUIT del cliente…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {q.trim().length >= 2 && (
        <ul className="sugerencias">
          {sugerencias.map((c) => (
            <li key={c.id}><button type="button" onClick={() => onChange(c)}>
              <strong>{c.nombre}</strong> <span className="sutil">{c.doc ?? ''}</span>
            </button></li>
          ))}
          <li><button type="button" className="crear" onClick={() => setNuevo({ nombre: q.trim(), doc: soloDigitos(q).length >= 7 ? q.trim() : null })}>
            ＋ Crear cliente nuevo “{q.trim()}”
          </button></li>
        </ul>
      )}
    </div>
  )
}

function CampoInput({ c, valor, onChange }: { c: Campo; valor: unknown; onChange: (v: unknown) => void }) {
  const v = valor == null ? '' : String(valor)
  if (c.tipo === 'opciones') {
    return (
      <label>{c.label}
        <select value={v} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {(c.opciones ?? []).map((o) => <option key={o}>{o}</option>)}
          {v && !(c.opciones ?? []).includes(v) && <option>{v}</option>}
        </select>
      </label>
    )
  }
  if (c.tipo === 'largo') return <label>{c.label}<textarea rows={4} value={v} onChange={(e) => onChange(e.target.value || null)} /></label>
  return (
    <label>{c.label}
      <input type={c.tipo === 'numero' ? 'number' : c.tipo === 'fecha' ? 'date' : 'text'} step="any" value={v}
        onChange={(e) => onChange(e.target.value === '' ? null : c.tipo === 'numero' ? Number(e.target.value) : e.target.value)} />
    </label>
  )
}

export default function PolizaForm() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const s = useStore()
  const nav = useNavigate()
  const existente = id ? s.poliza.get(Number(id)) : undefined
  const [p, setP] = useState<Partial<Poliza>>(() => existente ?? {
    rubro_id: Number(sp.get('rubro')) || s.rubros.find((r) => r.activo)?.id,
    aseguradora_id: Number(sp.get('aseg')) || null,
    cliente_id: Number(sp.get('cliente')) || null,
    gestion: 'Sin gestionar', estado: 'activa', datos: {}, origen: 'Alta en la app',
  })
  const [items, setItems] = useState<Partial<Item>[]>(() => existente ? (s.itemsDe.get(existente.id) ?? []).map((i) => ({ ...i })) : [{ patente: '', detalle: '' }])
  const [cliente, setCliente] = useState<Cliente | null>(() => (p.cliente_id ? s.cliente.get(p.cliente_id) ?? null : null))
  const [nuevoCliente, setNuevoCliente] = useState<Partial<Cliente> | null>(null)
  const [nuevaAseg, setNuevaAseg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const rubro = p.rubro_id ? s.rubro.get(p.rubro_id) : undefined
  const set = (k: keyof Poliza, v: unknown) => setP((x) => ({ ...x, [k]: v === '' ? null : v }))
  const setDato = (k: string, v: unknown) => setP((x) => ({ ...x, datos: { ...(x.datos ?? {}), [k]: v } }))

  const duplicado = useMemo(() => {
    const n = soloDigitos(p.numero)
    if (n.length < 4 || !p.aseguradora_id) return null
    return s.polizas.find((x) => x.id !== p.id && x.estado === 'activa' && x.aseguradora_id === p.aseguradora_id && soloDigitos(x.numero) === n) ?? null
  }, [p.numero, p.aseguradora_id, p.id, s.polizas])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!cliente && !nuevoCliente?.nombre?.trim()) return setError('Elegí o creá el cliente')
    if (!p.rubro_id) return setError('Elegí el rubro')
    if (!p.aseguradora_id && !nuevaAseg?.trim()) return setError('Elegí la compañía')
    if (p.desde && p.vence && p.vence < p.desde) return setError('El vencimiento es anterior al inicio')
    setGuardando(true)
    try {
      let cid = cliente?.id
      if (!cid) cid = (await s.guardarCliente({ ...nuevoCliente, nombre: nuevoCliente!.nombre!.trim() })).id
      let aid = p.aseguradora_id
      if (!aid) aid = (await s.guardar<Aseguradora>('aseguradoras', { nombre: nuevaAseg!.trim(), variantes: [], contactos: [], activa: true, web: null, portal: null } as unknown as Aseguradora)).id
      const g = await s.guardarPoliza({ ...p, cliente_id: cid, aseguradora_id: aid }, rubro?.usa_items ? items : undefined)
      nav(`/poliza/${g.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setGuardando(false)
    }
  }

  return (
    <form className="form tarjeta" onSubmit={guardar}>
      <h1>{existente ? 'Editar póliza' : 'Nueva póliza'}</h1>

      <fieldset><legend>Cliente</legend>
        <ClienteSelector valor={cliente} onChange={setCliente} nuevo={nuevoCliente} setNuevo={setNuevoCliente} />
      </fieldset>

      <fieldset><legend>Póliza</legend>
        <div className="dos">
          <label>Rubro
            <select value={p.rubro_id ?? ''} onChange={(e) => set('rubro_id', Number(e.target.value))}>
              {s.rubros.filter((r) => r.activo || r.id === p.rubro_id).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </label>
          {nuevaAseg == null ? (
            <label>Compañía
              <select value={p.aseguradora_id ?? ''} onChange={(e) => e.target.value === 'nueva' ? setNuevaAseg('') : set('aseguradora_id', Number(e.target.value) || null)}>
                <option value="">Elegir…</option>
                {s.aseguradoras.filter((a) => a.activa || a.id === p.aseguradora_id).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                <option value="nueva">＋ Otra compañía…</option>
              </select>
            </label>
          ) : (
            <label>Compañía nueva<input value={nuevaAseg} onChange={(e) => setNuevaAseg(e.target.value)} autoFocus />
              <button type="button" className="mini" onClick={() => setNuevaAseg(null)}>Elegir de la lista</button></label>
          )}
        </div>
        <div className="dos">
          <label>{rubro?.nombre === 'ART' ? 'Nº de contrato' : 'Nº de póliza'}
            <input value={p.numero ?? ''} onChange={(e) => set('numero', e.target.value)} placeholder={p.datos?.en_tramite ? 'En trámite' : ''} />
          </label>
          <label className="check abajo">
            <input type="checkbox" checked={!!p.datos?.en_tramite} onChange={(e) => setDato('en_tramite', e.target.checked || null)} /> Propuesta en trámite (sin número)
          </label>
        </div>
        {duplicado && <p className="error">Ojo: ya hay una póliza activa de esta compañía con ese número.</p>}
        {!rubro?.usa_items && <label>Riesgo / detalle<input value={p.detalle ?? ''} onChange={(e) => set('detalle', e.target.value)} /></label>}
        <div className="dos">
          <label>Vigencia desde<input type="date" value={p.desde ?? ''} onChange={(e) => set('desde', e.target.value)} /></label>
          <label>Vence<input type="date" value={p.vence ?? ''} onChange={(e) => set('vence', e.target.value)} /></label>
        </div>
        {p.desde && (
          <div className="atajos">Vence a:
            {[[4, '4 meses'], [6, '6 meses'], [12, '1 año']].map(([m, t]) => (
              <button type="button" key={m} className="mini" onClick={() => set('vence', sumarMeses(p.desde!, m as number))}>{t}</button>
            ))}
          </div>
        )}
        <label>Fin anual (si el vencimiento es un cierre parcial, como Mercantil)
          <input type="date" value={p.fin_anual ?? ''} onChange={(e) => set('fin_anual', e.target.value)} />
        </label>
        <div className="dos">
          <label>Renovación
            <select value={p.renovacion ?? ''} onChange={(e) => set('renovacion', e.target.value)}>
              <option value="">Sin definir</option>
              {s.config.renovacion.map((o) => <option key={o.v}>{o.v}</option>)}
            </select>
          </label>
          <label>Estado de cuota
            <select value={p.estado_cuota ?? ''} onChange={(e) => set('estado_cuota', e.target.value)}>
              <option value="">—</option>
              {s.config.estado_cuota.map((o) => <option key={o.v}>{o.v}</option>)}
            </select>
          </label>
        </div>
        <label>Próx. vto. de cuota<input type="date" value={p.prox_vto_cuota ?? ''} onChange={(e) => set('prox_vto_cuota', e.target.value)} /></label>
      </fieldset>

      {rubro?.usa_items && (
        <fieldset><legend>Vehículos</legend>
          {items.map((it, i) => (
            <div key={it.id ?? `n${i}`} className="item-fila">
              <input placeholder="Patente" value={it.patente ?? ''} className="patente"
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, patente: e.target.value.toUpperCase().replace(/[\s-]/g, '') || null } : x)))} />
              <input placeholder="Marca, modelo, versión" value={it.detalle ?? ''}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, detalle: e.target.value || null } : x)))} />
              <input placeholder="Año" inputMode="numeric" className="anio" value={String(it.datos?.anio ?? '')}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, datos: { ...(x.datos ?? {}), anio: e.target.value || undefined } } : x)))} />
              <button type="button" className="icono" aria-label="Quitar vehículo" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="mini" onClick={() => setItems([...items, { patente: '', detalle: '' }])}>＋ Agregar vehículo (flota)</button>
          {p.rubro_id && <label>Descripción general (opcional)<input value={p.detalle ?? ''} onChange={(e) => set('detalle', e.target.value)} placeholder="Ej.: Flota de 13 vehículos" /></label>}
        </fieldset>
      )}

      {!!rubro?.campos.length && (
        <fieldset><legend>Datos de {rubro.nombre}</legend>
          <div className="campos">
            {rubro.campos.map((c) => <CampoInput key={c.k} c={c} valor={p.datos?.[c.k]} onChange={(v) => setDato(c.k, v)} />)}
          </div>
        </fieldset>
      )}

      <fieldset><legend>Notas</legend>
        <textarea rows={3} value={p.notas ?? ''} onChange={(e) => set('notas', e.target.value)} />
        {p.revisar != null && (
          <label>Para completar (borralo cuando esté resuelto)<input value={p.revisar ?? ''} onChange={(e) => set('revisar', e.target.value)} /></label>
        )}
      </fieldset>

      {error && <p className="error">{error}</p>}
      <div className="fila-botones barra-guardar">
        <button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="secundario" onClick={() => nav(-1)}>Cancelar</button>
      </div>
    </form>
  )
}
