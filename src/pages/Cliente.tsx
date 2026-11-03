import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { ListaPolizas, Modal, ordenarPorVto } from '../components/ui'
import type { Cliente } from '../lib/types'
import { whatsapp } from '../lib/util'

export function ClienteForm({ inicial, onListo, onCancelar }:
  { inicial: Partial<Cliente>; onListo: (c: Cliente) => void; onCancelar: () => void }) {
  const s = useStore()
  const [c, setC] = useState<Partial<Cliente>>(inicial)
  const [error, setError] = useState<string | null>(null)
  const campo = (k: keyof Cliente, label: string, tipo = 'text') => (
    <label>{label}
      <input type={tipo} value={(c[k] as string) ?? ''} onChange={(e) => setC({ ...c, [k]: e.target.value || null })} />
    </label>
  )
  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!c.nombre?.trim()) return setError('Falta el nombre')
    try { onListo(await s.guardarCliente({ ...c, nombre: c.nombre.trim() })) } catch (err) { setError((err as Error).message) }
  }
  return (
    <form onSubmit={guardar} className="form">
      {campo('nombre', 'Nombre o razón social')}
      <div className="dos">{campo('doc', 'DNI / CUIT')}{campo('telefono', 'Teléfono', 'tel')}</div>
      {campo('mail', 'Mail', 'email')}
      {campo('domicilio', 'Domicilio')}
      <label>Observaciones
        <textarea rows={3} value={c.observaciones ?? ''} onChange={(e) => setC({ ...c, observaciones: e.target.value || null })} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="fila-botones"><button type="submit">Guardar</button><button type="button" className="secundario" onClick={onCancelar}>Cancelar</button></div>
    </form>
  )
}

export default function ClientePage() {
  const { id } = useParams()
  const s = useStore()
  const c = s.cliente.get(Number(id))
  const [editando, setEditando] = useState(false)
  const ps = useMemo(() => [...(s.polizasDe.get(Number(id)) ?? [])].sort(ordenarPorVto), [s.polizasDe, id])
  if (!c) return <p className="vacio">No se encontró el cliente.</p>
  const activas = ps.filter((p) => p.estado === 'activa')
  const bajas = ps.filter((p) => p.estado === 'baja')
  const wa = whatsapp(c.telefono)
  return (
    <div>
      <div className="ficha tarjeta">
        <div className="titulo-fila">
          <h1>{c.nombre}</h1>
          <button className="secundario" onClick={() => setEditando(true)}>Editar</button>
        </div>
        <dl className="datos">
          <dt>DNI / CUIT</dt><dd>{c.doc ?? '—'}</dd>
          <dt>Teléfono</dt><dd>{c.telefono ?? '—'}</dd>
          <dt>Mail</dt><dd>{c.mail ?? '—'}</dd>
          {c.domicilio && <><dt>Domicilio</dt><dd>{c.domicilio}</dd></>}
          {c.observaciones && <><dt>Observaciones</dt><dd className="pre">{c.observaciones}</dd></>}
        </dl>
        <div className="fila-botones">
          {c.telefono && <a className="boton secundario" href={`tel:${c.telefono}`}>📞 Llamar</a>}
          {wa && <a className="boton secundario" href={wa} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
          {c.mail && <a className="boton secundario" href={`mailto:${c.mail}`}>✉ Mail</a>}
          <Link className="boton" to={`/poliza/nueva?cliente=${c.id}`}>＋ Nueva póliza</Link>
        </div>
      </div>
      <h2>Seguros activos <span className="cuenta">{activas.length}</span></h2>
      <ListaPolizas polizas={activas} vacio="No tiene pólizas activas." />
      {bajas.length > 0 && (
        <details className="historico-cliente">
          <summary>Histórico ({bajas.length})</summary>
          <ListaPolizas polizas={bajas} />
        </details>
      )}
      {editando && (
        <Modal titulo="Editar cliente" onClose={() => setEditando(false)}>
          <ClienteForm inicial={c} onListo={() => setEditando(false)} onCancelar={() => setEditando(false)} />
        </Modal>
      )}
    </div>
  )
}
