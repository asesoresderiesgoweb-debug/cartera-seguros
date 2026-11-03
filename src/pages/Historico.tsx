import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Chips, ListaPolizas } from '../components/ui'
import { norm } from '../lib/util'

export default function Historico() {
  const s = useStore()
  const [rubro, setRubro] = useState(0)
  const [motivo, setMotivo] = useState('')
  const [q, setQ] = useState('')
  const bajas = useMemo(() => s.polizas.filter((p) => p.estado === 'baja'), [s.polizas])
  const motivos = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of bajas) m.set(p.baja_motivo ?? 'Sin motivo', (m.get(p.baja_motivo ?? 'Sin motivo') ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [bajas])
  const lista = useMemo(() => {
    const t = norm(q).trim()
    return bajas
      .filter((p) => !rubro || p.rubro_id === rubro)
      .filter((p) => !motivo || (p.baja_motivo ?? 'Sin motivo') === motivo)
      .filter((p) => !t || (s.textoPoliza.get(p.id) ?? '').includes(t))
      .sort((a, b) => ((b.baja_fecha ?? b.vence ?? '') > (a.baja_fecha ?? a.vence ?? '') ? 1 : -1))
  }, [bajas, rubro, motivo, q, s.textoPoliza])
  return (
    <div>
      <h1>Histórico</h1>
      <p className="ayuda">Bajas, anulaciones, renovadas y vencidas sin renovar. Desde cada póliza se puede reactivar.</p>
      <Chips<number> valor={rubro} onChange={setRubro}
        opciones={[{ v: 0, label: 'Todos', n: bajas.length }, ...s.rubros.map((r) => ({ v: r.id, label: r.nombre, n: bajas.filter((p) => p.rubro_id === r.id).length }))]} />
      <div className="dos">
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          <option value="">Todos los motivos</option>
          {motivos.map(([m, n]) => <option key={m} value={m}>{m} ({n})</option>)}
        </select>
        <input type="search" placeholder="Filtrar por nombre, póliza, patente…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="sutil">{lista.length} registros</p>
      <ListaPolizas polizas={lista} />
    </div>
  )
}
