import type { Config, Poliza } from './types'
import { avisaVto, cuotaARevisar, estadoVto, hoyISO, requiereAccion } from './util'

export interface Resumen {
  vencidas: Poliza[]
  porVencer: Poliza[]
  cuotas: Poliza[]
  accion: Poliza[] // manual / cupones que vencen pronto
  completar: Poliza[]
  sinRenovacion: Poliza[]
  activas: Poliza[]
}

export function resumir(polizas: Poliza[], cfg: Config): Resumen {
  const hoy = hoyISO()
  const r: Resumen = { vencidas: [], porVencer: [], cuotas: [], accion: [], completar: [], sinRenovacion: [], activas: [] }
  for (const p of polizas) {
    if (p.estado !== 'activa') continue
    r.activas.push(p)
    if (avisaVto(p, cfg, hoy)) {
      const e = estadoVto(p, cfg, hoy)
      if (e === 'VENCIDA') r.vencidas.push(p)
      else r.porVencer.push(p)
      if (requiereAccion(p, cfg)) r.accion.push(p)
    }
    if (cuotaARevisar(p, cfg, hoy)) r.cuotas.push(p)
    if (p.revisar) r.completar.push(p)
    if (!p.renovacion) r.sinRenovacion.push(p)
  }
  return r
}
