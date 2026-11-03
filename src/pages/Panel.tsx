import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { resumir } from '../lib/avisos'
import { ListaPolizas, ordenarPorVto } from '../components/ui'
import { backend } from '../lib/backend'
import { fmtFecha, hoyISO } from '../lib/util'

export default function Panel() {
  const s = useStore()
  const r = useMemo(() => resumir(s.polizas, s.config), [s.polizas, s.config])
  const porRubro = useMemo(() => s.rubros.filter((x) => x.activo).map((rb) => {
    const ps = r.activas.filter((p) => p.rubro_id === rb.id)
    const ids = new Set(ps.map((p) => p.id))
    return {
      rb, total: ps.length,
      venc: r.vencidas.filter((p) => ids.has(p.id)).length,
      porv: r.porVencer.filter((p) => ids.has(p.id)).length,
    }
  }), [s.rubros, r])

  const kpi = (tab: string, n: number, txt: string, cls: string, sub?: string) => (
    <Link to={`/avisos?tab=${tab}`} className={`kpi ${cls}`}>
      <span className="kpi-n">{n}</span>
      <span className="kpi-txt">{txt}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </Link>
  )
  const proximos = [...r.vencidas, ...r.porVencer].sort(ordenarPorVto).slice(0, 8)

  return (
    <div>
      {backend.demo && <p className="aviso-demo">Modo demostración con los datos importados. Los cambios no se guardan.</p>}
      <div className="titulo-fila">
        <h1>Hola 👋</h1>
        <span className="sutil">Hoy {fmtFecha(hoyISO())} · {r.activas.length} pólizas activas</span>
      </div>
      <div className="kpis">
        {kpi('vencidas', r.vencidas.length, 'Vencidas', 'rojo', 'sin renovar')}
        {kpi('porvencer', r.porVencer.length, 'Por vencer', 'amarillo', `próx. ${s.config.dias_aviso} días`)}
        {kpi('cuotas', r.cuotas.length, 'Cuotas a revisar', 'azul', 'pendientes / impagas')}
        {kpi('accion', r.accion.length, 'Manual o cupones', 'violeta', 'requieren acción')}
        {kpi('completar', r.completar.length, 'Para completar', 'gris', 'faltan datos')}
      </div>

      <h2>Por rubro</h2>
      <div className="rubros-grid">
        {porRubro.map(({ rb, total, venc, porv }) => (
          <Link key={rb.id} to={`/cartera?rubro=${rb.id}`} className="rubro-card">
            <span className="rubro-nombre">{rb.nombre}</span>
            <span className="rubro-total">{total}</span>
            <span className="rubro-alertas">
              {venc > 0 && <span className="punto rojo">{venc}</span>}
              {porv > 0 && <span className="punto amarillo">{porv}</span>}
            </span>
          </Link>
        ))}
      </div>

      <div className="titulo-fila">
        <h2>Próximos vencimientos</h2>
        <Link to="/avisos">Ver todos →</Link>
      </div>
      <ListaPolizas polizas={proximos} vacio="No hay vencimientos pendientes. 🎉" />
    </div>
  )
}
