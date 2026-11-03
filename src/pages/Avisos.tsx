import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { resumir } from '../lib/avisos'
import { Chips, ListaAgrupada } from '../components/ui'

type Tab = 'vencimientos' | 'vencidas' | 'porvencer' | 'cuotas' | 'accion' | 'completar' | 'sinrenov'

export default function Avisos() {
  const s = useStore()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'vencimientos'
  const r = useMemo(() => resumir(s.polizas, s.config), [s.polizas, s.config])
  const listas: Record<Tab, { label: string; ps: typeof r.activas; ayuda: string }> = {
    vencimientos: { label: 'Vencimientos', ps: [...r.vencidas, ...r.porVencer], ayuda: `Vencidas y las que vencen en los próximos ${s.config.dias_aviso} días. Dejan de aparecer al marcar la gestión como Renovado o No renueva.` },
    vencidas: { label: 'Vencidas', ps: r.vencidas, ayuda: `Ya vencieron y nadie marcó Renovado ni No renueva. A los ${s.config.dias_historico} días pasan solas al Histórico.` },
    porvencer: { label: 'Por vencer', ps: r.porVencer, ayuda: `Vencen en los próximos ${s.config.dias_aviso} días.` },
    accion: { label: 'Manual / cupones', ps: r.accion, ayuda: 'Por vencer o vencidas con renovación manual o por cupones: no se renuevan solas.' },
    cuotas: { label: 'Cuotas', ps: r.cuotas, ayuda: `Cuota Pendiente o Impaga, o con próximo vencimiento de cuota en ${s.config.dias_cuota} días o menos.` },
    completar: { label: 'Para completar', ps: r.completar, ayuda: 'Pólizas con datos faltantes o dudosos de la importación (fechas mal escritas, Triunfo sin número, etc.). Al editarlas y borrar el aviso, salen de esta lista.' },
    sinrenov: { label: 'Renovación sin definir', ps: r.sinRenovacion, ayuda: 'No se sabe si renuevan solas, a mano o por cupones. Se pueden marcar de a muchas en Ajustes → Renovación masiva.' },
  }
  const actual = listas[tab] ?? listas.vencimientos
  return (
    <div>
      <h1>Avisos</h1>
      <Chips<Tab> valor={tab} onChange={(t) => setSp({ tab: t }, { replace: true })}
        opciones={(Object.keys(listas) as Tab[]).map((k) => ({ v: k, label: listas[k].label, n: listas[k].ps.length }))} />
      <p className="ayuda">{actual.ayuda}</p>
      <ListaAgrupada polizas={actual.ps} vacio="No hay avisos acá. 🎉" />
    </div>
  )
}
