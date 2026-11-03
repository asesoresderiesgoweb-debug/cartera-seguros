import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { Chips, ListaPolizas, ordenarPorVto } from '../components/ui'
import { estadoVto, type EstadoVto } from '../lib/util'

type FiltroE = 'todas' | EstadoVto

export default function Cartera() {
  const s = useStore()
  const [sp, setSp] = useSearchParams()
  const rubroId = Number(sp.get('rubro')) || s.rubros.find((r) => r.activo)?.id || 0
  const asegId = Number(sp.get('aseg')) || 0
  const filtro = (sp.get('estado') as FiltroE) || 'todas'
  const set = (k: string, v: string | number) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, String(v)); else n.delete(k)
    if (k === 'rubro') n.delete('aseg')
    setSp(n, { replace: true })
  }

  const activas = useMemo(() => s.polizas.filter((p) => p.estado === 'activa'), [s.polizas])
  const delRubro = useMemo(() => activas.filter((p) => p.rubro_id === rubroId), [activas, rubroId])
  const asegs = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of delRubro) m.set(p.aseguradora_id ?? 0, (m.get(p.aseguradora_id ?? 0) ?? 0) + 1)
    return [...m.entries()].map(([id, n]) => ({ id, n, nombre: s.aseguradora.get(id)?.nombre ?? 'Sin compañía' }))
      .sort((a, b) => b.n - a.n)
  }, [delRubro, s.aseguradora])
  const lista = useMemo(() => delRubro
    .filter((p) => !asegId || (p.aseguradora_id ?? 0) === asegId)
    .filter((p) => filtro === 'todas' || estadoVto(p, s.config) === filtro)
    .sort(ordenarPorVto), [delRubro, asegId, filtro, s.config])

  return (
    <div>
      <div className="titulo-fila">
        <h1>Cartera</h1>
        <Link className="boton" to={`/poliza/nueva?rubro=${rubroId}${asegId ? `&aseg=${asegId}` : ''}`}>＋ Nueva póliza</Link>
      </div>
      <Chips<number> valor={rubroId} onChange={(v) => set('rubro', v)}
        opciones={s.rubros.filter((r) => r.activo).map((r) => ({ v: r.id, label: r.nombre, n: activas.filter((p) => p.rubro_id === r.id).length }))} />
      <Chips<number> valor={asegId} onChange={(v) => set('aseg', v)}
        opciones={[{ v: 0, label: 'Todas las compañías', n: delRubro.length }, ...asegs.map((a) => ({ v: a.id, label: a.nombre, n: a.n }))]} />
      <div className="filtro-estado">
        {(['todas', 'VENCIDA', 'POR VENCER', 'VIGENTE', 'SIN VTO.'] as FiltroE[]).map((f) => (
          <button key={f} className={`mini ${filtro === f ? 'activo' : ''}`} onClick={() => set('estado', f === 'todas' ? '' : f)}>
            {f === 'todas' ? 'Todas' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
        <span className="sutil">{lista.length} pólizas</span>
      </div>
      <ListaPolizas polizas={lista} mostrarRubro={false} />
    </div>
  )
}
