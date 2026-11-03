import type { Config, Poliza } from './types'

// ---------------------------------------------------------------- fechas

/** Hoy en Argentina como AAAA-MM-DD (independiente de la zona del dispositivo). */
export function hoyISO(): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba', year: 'numeric', month: '2-digit', day: '2-digit' })
  return f.format(new Date())
}

const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))

export function diasHasta(iso: string, desde = hoyISO()): number {
  return Math.round((dia(iso) - dia(desde)) / 86400000)
}

export function sumarDias(iso: string, n: number): string {
  return new Date(dia(iso) + n * 86400000).toISOString().slice(0, 10)
}

export function sumarMeses(iso: string, n: number): string {
  const d = new Date(dia(iso))
  const dd = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dd, fin))
  return d.toISOString().slice(0, 10)
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

export function fmtDias(n: number): string {
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  if (n === -1) return 'ayer'
  return n > 0 ? `en ${n} días` : `hace ${-n} días`
}

export const fmtPesos = (n: unknown) =>
  typeof n === 'number' ? n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) : '—'

// ---------------------------------------------------------------- texto

export function norm(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
export const soloDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '')

export function whatsapp(tel: string | null): string | null {
  let d = soloDigitos(tel)
  if (!d) return null
  if (d.startsWith('0')) d = d.slice(1)
  if (d.startsWith('54')) return `https://wa.me/${d}`
  if (d.length === 10) return `https://wa.me/549${d}`
  return `https://wa.me/${d}`
}

// ---------------------------------------------------------------- estados

export type EstadoVto = 'VENCIDA' | 'POR VENCER' | 'VIGENTE' | 'SIN VTO.'

export function estadoVto(p: Poliza, cfg: Config, hoy = hoyISO()): EstadoVto {
  if (!p.vence) return 'SIN VTO.'
  const d = diasHasta(p.vence, hoy)
  if (d < 0) return 'VENCIDA'
  if (d <= cfg.dias_aviso) return 'POR VENCER'
  return 'VIGENTE'
}

const tiene = (ops: { v: string }[], v: string | null, flag: 'cierra' | 'alerta' | 'accion') =>
  !!v && ops.some((o) => o.v === v && (o as Record<string, unknown>)[flag])

export const gestionCerrada = (p: Poliza, cfg: Config) => tiene(cfg.gestion, p.gestion, 'cierra')
export const requiereAccion = (p: Poliza, cfg: Config) => tiene(cfg.renovacion, p.renovacion, 'accion')

/** Vencida o por vencer, activa y sin gestión cerrada: hay que avisar. */
export function avisaVto(p: Poliza, cfg: Config, hoy = hoyISO()): boolean {
  if (p.estado !== 'activa' || gestionCerrada(p, cfg)) return false
  const e = estadoVto(p, cfg, hoy)
  return e === 'VENCIDA' || e === 'POR VENCER'
}

export function cuotaARevisar(p: Poliza, cfg: Config, hoy = hoyISO()): boolean {
  if (p.estado !== 'activa') return false
  if (tiene(cfg.estado_cuota, p.estado_cuota, 'alerta')) return true
  return !!p.prox_vto_cuota && diasHasta(p.prox_vto_cuota, hoy) <= cfg.dias_cuota
}

export function claseEstado(e: EstadoVto): string {
  return { VENCIDA: 'rojo', 'POR VENCER': 'amarillo', VIGENTE: 'verde', 'SIN VTO.': 'gris' }[e]
}
