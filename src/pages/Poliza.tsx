import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { Modal, Semaforo } from '../components/ui'
import type { Poliza } from '../lib/types'
import {
  cuotaARevisar, diasHasta, estadoVto, fmtDias, fmtFecha, fmtPesos, gestionCerrada, hoyISO, requiereAccion, sumarDias,
} from '../lib/util'

function RenovarModal({ p, onClose }: { p: Poliza; onClose: () => void }) {
  const s = useStore()
  const nav = useNavigate()
  const duracion = p.desde && p.vence ? diasHasta(p.vence, p.desde) : 365
  const [numero, setNumero] = useState(p.numero ?? '')
  const [desde, setDesde] = useState(p.vence ?? hoyISO())
  const [vence, setVence] = useState(sumarDias(p.vence ?? hoyISO(), duracion > 0 ? duracion : 365))
  const [nueva, setNueva] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!vence) return setError('Falta el nuevo vencimiento')
    try {
      if (nueva) {
        const items = (s.itemsDe.get(p.id) ?? []).map(({ patente, detalle, datos }) => ({ patente, detalle, datos }))
        const { id: _id, updated_at: _u, updated_by: _b, ...resto } = p
        const n = await s.guardarPoliza({
          ...resto, numero: numero || null, desde, vence, gestion: 'Sin gestionar', revisar: null,
          renovada_de: p.id, origen: 'Renovación', estado: 'activa', baja_motivo: null, baja_fecha: null,
        }, items)
        await s.guardarPoliza({ ...p, estado: 'baja', gestion: 'Renovado', baja_motivo: 'Renovada', baja_fecha: p.vence ?? hoyISO() })
        onClose()
        nav(`/poliza/${n.id}`, { replace: true })
      } else {
        const nota = `Renovada el ${fmtFecha(hoyISO())} (vencía ${fmtFecha(p.vence)}${p.numero && p.numero !== numero ? `, Nº anterior ${p.numero}` : ''})`
        await s.guardarPoliza({
          ...p, numero: numero || null, desde, vence, gestion: 'Sin gestionar',
          notas: p.notas ? `${p.notas}\n${nota}` : nota,
        })
        onClose()
      }
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <Modal titulo="Marcar como renovada" onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <label>Número de póliza<input value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
        <div className="dos">
          <label>Nueva vigencia desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Nuevo vencimiento<input type="date" value={vence} onChange={(e) => setVence(e.target.value)} required /></label>
        </div>
        <label className="check">
          <input type="checkbox" checked={nueva} onChange={(e) => setNueva(e.target.checked)} />
          Crear la renovación como póliza nueva y guardar esta en el Histórico
        </label>
        <p className="ayuda">Si no marcás la casilla, se actualizan las fechas de esta misma póliza y queda una nota.</p>
        {error && <p className="error">{error}</p>}
        <div className="fila-botones"><button type="submit">Guardar renovación</button><button type="button" className="secundario" onClick={onClose}>Cancelar</button></div>
      </form>
    </Modal>
  )
}

function BajaModal({ p, inicial, onClose }: { p: Poliza; inicial: string; onClose: () => void }) {
  const s = useStore()
  const [motivo, setMotivo] = useState(inicial)
  const [fecha, setFecha] = useState(hoyISO())
  const motivos = ['No renueva', 'Anulada', 'Rescindida', 'Falta de pago', 'Venta del vehículo', 'Pasó a otra compañía', 'Vencida sin renovar', 'Otro']
  async function guardar(e: FormEvent) {
    e.preventDefault()
    await s.guardarPoliza({ ...p, estado: 'baja', baja_motivo: motivo, baja_fecha: fecha, gestion: motivo === 'No renueva' ? 'No renueva' : p.gestion })
    onClose()
  }
  return (
    <Modal titulo="Pasar al Histórico" onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <label>Motivo
          <select value={motivos.includes(motivo) ? motivo : 'Otro'} onChange={(e) => setMotivo(e.target.value)}>
            {motivos.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        {!motivos.slice(0, -1).includes(motivo) && (
          <label>Detalle del motivo<input value={motivo === 'Otro' ? '' : motivo} onChange={(e) => setMotivo(e.target.value || 'Otro')} /></label>
        )}
        <label>Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <div className="fila-botones"><button type="submit" className="peligro">Pasar al Histórico</button><button type="button" className="secundario" onClick={onClose}>Cancelar</button></div>
      </form>
    </Modal>
  )
}

export default function PolizaPage() {
  const { id } = useParams()
  const s = useStore()
  const p = s.poliza.get(Number(id))
  const [modal, setModal] = useState<null | 'renovar' | 'baja' | 'noRenueva'>(null)
  const [guardando, setGuardando] = useState(false)
  if (!p) return <p className="vacio">No se encontró la póliza.</p>
  const c = p.cliente_id ? s.cliente.get(p.cliente_id) : undefined
  const a = p.aseguradora_id ? s.aseguradora.get(p.aseguradora_id) : undefined
  const r = p.rubro_id ? s.rubro.get(p.rubro_id) : undefined
  const its = s.itemsDe.get(p.id) ?? []
  const e = estadoVto(p, s.config)
  const anterior = p.renovada_de ? s.poliza.get(p.renovada_de) : undefined
  const siguiente = s.polizas.find((x) => x.renovada_de === p.id)

  async function cambiar(cambios: Partial<Poliza>) {
    setGuardando(true)
    try { await s.guardarPoliza({ ...p!, ...cambios }) } catch (err) { alert((err as Error).message) }
    setGuardando(false)
  }
  function elegirGestion(v: string) {
    if (v === 'Renovado') return setModal('renovar')
    cambiar({ gestion: v })
    if (v === 'No renueva') setModal('noRenueva')
  }

  return (
    <div>
      <div className="tarjeta ficha">
        <div className="titulo-fila">
          <div>
            <div className="sutil">{r?.nombre} · {a?.nombre ?? 'Sin compañía'}</div>
            <h1>{p.numero ? `Póliza ${p.numero}` : p.datos?.en_tramite ? 'Póliza en trámite' : 'Póliza sin número'}</h1>
            {c && <Link to={`/cliente/${c.id}`} className="enlace-cliente">{c.nombre} →</Link>}
          </div>
          {p.estado === 'activa' ? <Semaforo e={e} /> : <span className="pill gris">HISTÓRICO</span>}
        </div>

        {p.revisar && (
          <div className="banner revisar">
            <strong>Para completar:</strong> {p.revisar}
            <button className="mini" onClick={() => cambiar({ revisar: null })} disabled={guardando}>Ya está completo</button>
          </div>
        )}
        {p.estado === 'baja' && (
          <div className="banner">
            En Histórico desde {fmtFecha(p.baja_fecha)} — {p.baja_motivo ?? 'sin motivo'}
            <button className="mini" onClick={() => cambiar({ estado: 'activa', baja_motivo: null, baja_fecha: null, gestion: 'Sin gestionar' })}>Reactivar</button>
          </div>
        )}

        <dl className="datos">
          <dt>Vigencia</dt><dd>{fmtFecha(p.desde)} → <strong>{fmtFecha(p.vence)}</strong>{p.vence && p.estado === 'activa' && <span className="sutil"> ({fmtDias(diasHasta(p.vence))})</span>}</dd>
          {p.fin_anual && <><dt>Fin anual</dt><dd>{fmtFecha(p.fin_anual)}</dd></>}
          {p.detalle && <><dt>Riesgo / detalle</dt><dd>{p.detalle}</dd></>}
          {r?.campos.map((cp) => p.datos?.[cp.k] != null && p.datos[cp.k] !== '' && (
            <div key={cp.k} className="dato-par">
              <dt>{cp.label}</dt>
              <dd className={cp.tipo === 'largo' ? 'pre' : ''}>{cp.k === 'costo_mensual' ? fmtPesos(p.datos[cp.k]) : cp.tipo === 'fecha' ? fmtFecha(String(p.datos[cp.k])) : String(p.datos[cp.k])}</dd>
            </div>
          ))}
          {Object.entries(p.datos ?? {}).filter(([k]) => !r?.campos.some((cp) => cp.k === k) && !['en_tramite', 'vigencia_continua'].includes(k)).map(([k, v]) => (
            <div key={k} className="dato-par"><dt>{k.replace(/_/g, ' ')}</dt><dd>{String(v)}</dd></div>
          ))}
        </dl>

        {its.length > 0 && (
          <>
            <h3>{its.length > 1 ? `Vehículos (${its.length})` : 'Vehículo'}</h3>
            <ul className="items">
              {its.map((it) => <li key={it.id}><strong>{it.patente ?? 'Sin patente'}</strong> {it.detalle}{it.datos?.anio ? ` · ${it.datos.anio}` : ''}</li>)}
            </ul>
          </>
        )}
        {p.notas && <><h3>Notas</h3><p className="pre">{p.notas}</p></>}
        {(anterior || siguiente) && (
          <p className="sutil">
            {anterior && <>Renovación de <Link to={`/poliza/${anterior.id}`}>{anterior.numero ?? 'póliza anterior'}</Link>. </>}
            {siguiente && <>Renovada en <Link to={`/poliza/${siguiente.id}`}>{siguiente.numero ?? 'póliza nueva'}</Link>.</>}
          </p>
        )}
        {a && (a.portal || a.web) && <p><a href={(a.portal || a.web)!} target="_blank" rel="noreferrer">Ir al portal de {a.nombre} ↗</a></p>}
      </div>

      {p.estado === 'activa' && (
        <div className="tarjeta">
          <h3>Renovación</h3>
          <div className="segmentos">
            {s.config.renovacion.map((o) => (
              <button key={o.v} className={`seg ${p.renovacion === o.v ? 'activo' : ''} ${o.accion ? 'accion' : ''}`}
                onClick={() => cambiar({ renovacion: p.renovacion === o.v ? null : o.v })} disabled={guardando}>{o.v}</button>
            ))}
          </div>
          {!p.renovacion && <p className="ayuda">Sin definir: tocá la opción que corresponda.</p>}
          {requiereAccion(p, s.config) && <p className="ayuda destacado">No se renueva sola: hay que gestionarla antes del vencimiento.</p>}

          <h3>Gestión del vencimiento</h3>
          <div className="segmentos">
            {s.config.gestion.map((o) => (
              <button key={o.v} className={`seg ${(p.gestion ?? 'Sin gestionar') === o.v ? 'activo' : ''}`}
                onClick={() => elegirGestion(o.v)} disabled={guardando}>{o.v}</button>
            ))}
          </div>
          {gestionCerrada(p, s.config) && <p className="ayuda">Esta póliza ya no genera avisos de vencimiento.</p>}

          <h3>Cuotas</h3>
          <div className="dos">
            <label>Estado de cuota
              <select value={p.estado_cuota ?? ''} onChange={(ev) => cambiar({ estado_cuota: ev.target.value || null })} disabled={guardando}>
                <option value="">—</option>
                {s.config.estado_cuota.map((o) => <option key={o.v}>{o.v}</option>)}
              </select>
            </label>
            <label>Próx. vto. de cuota
              <input type="date" value={p.prox_vto_cuota ?? ''} onChange={(ev) => cambiar({ prox_vto_cuota: ev.target.value || null })} disabled={guardando} />
            </label>
          </div>
          {cuotaARevisar(p, s.config) && <p className="ayuda destacado">Cuota a revisar.</p>}
        </div>
      )}

      <div className="fila-botones">
        <Link className="boton" to={`/poliza/${p.id}/editar`}>Editar datos</Link>
        {p.estado === 'activa' && <button className="secundario" onClick={() => setModal('renovar')}>Renovar</button>}
        {p.estado === 'activa' && <button className="secundario peligro-texto" onClick={() => setModal('baja')}>Pasar al Histórico</button>}
      </div>
      {p.updated_by && <p className="sutil">Último cambio: {p.updated_by}{p.updated_at ? ` · ${new Date(p.updated_at).toLocaleString('es-AR')}` : ''}</p>}

      {modal === 'renovar' && <RenovarModal p={p} onClose={() => setModal(null)} />}
      {modal === 'baja' && <BajaModal p={p} inicial="No renueva" onClose={() => setModal(null)} />}
      {modal === 'noRenueva' && (
        <Modal titulo="No renueva" onClose={() => setModal(null)}>
          <p>Marcada como <strong>No renueva</strong>: ya no va a avisar. ¿La pasás ahora al Histórico?</p>
          <div className="fila-botones">
            <button className="peligro" onClick={async () => { await cambiar({ gestion: 'No renueva', estado: 'baja', baja_motivo: 'No renueva', baja_fecha: hoyISO() }); setModal(null) }}>Sí, al Histórico</button>
            <button className="secundario" onClick={() => setModal(null)}>Todavía no</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
