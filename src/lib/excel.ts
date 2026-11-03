import writeXlsxFile from 'write-excel-file'
import type { Datos } from './types'
import { estadoVto, hoyISO } from './util'

type Celda = { value: string | number | Date | null; type?: unknown; format?: string; fontWeight?: 'bold' } | null

const fecha = (iso: string | null): Celda => (iso ? { value: new Date(`${iso}T12:00:00`), type: Date, format: 'dd/mm/yyyy' } : null)
const txt = (v: unknown): Celda => (v == null || v === '' ? null : { value: String(v), type: String })
const num = (v: unknown): Celda => (typeof v === 'number' ? { value: v, type: Number } : txt(v))
const cab = (t: string[]): Celda[] => t.map((value) => ({ value, fontWeight: 'bold' }))

/** Exporta toda la cartera: una hoja por rubro, Histórico y Clientes. */
export async function exportarExcel(d: Datos) {
  const cli = new Map(d.clientes.map((c) => [c.id, c]))
  const ase = new Map(d.aseguradoras.map((a) => [a.id, a.nombre]))
  const rub = new Map(d.rubros.map((r) => [r.id, r]))
  const its = new Map<number, string[]>()
  for (const i of d.items) its.set(i.poliza_id, [...(its.get(i.poliza_id) ?? []), [i.patente, i.detalle].filter(Boolean).join(' ')])

  const hojas: Celda[][][] = []
  const nombres: string[] = []
  for (const r of [...d.rubros].sort((a, b) => a.orden - b.orden)) {
    const ps = d.polizas.filter((p) => p.estado === 'activa' && p.rubro_id === r.id)
    if (!ps.length) continue
    const campos = r.campos.map((c) => c.label)
    const filas: Celda[][] = [cab(['Compañía', 'Asegurado', 'DNI / CUIT', 'Teléfono', 'Mail', 'Póliza', 'Riesgo / detalle',
      ...(r.usa_items ? ['Vehículos'] : []), 'Vigencia desde', 'Vence', 'Fin anual', 'Estado', 'Renovación', 'Gestión',
      'Estado cuota', 'Próx. vto. cuota', ...campos, 'Notas', 'Para completar'])]
    for (const p of ps) {
      const c = p.cliente_id ? cli.get(p.cliente_id) : undefined
      filas.push([
        txt(ase.get(p.aseguradora_id ?? -1)), txt(c?.nombre), txt(c?.doc), txt(c?.telefono), txt(c?.mail), txt(p.numero), txt(p.detalle),
        ...(r.usa_items ? [txt((its.get(p.id) ?? []).join('; '))] : []),
        fecha(p.desde), fecha(p.vence), fecha(p.fin_anual), txt(estadoVto(p, d.config)), txt(p.renovacion), txt(p.gestion),
        txt(p.estado_cuota), fecha(p.prox_vto_cuota),
        ...r.campos.map((cp) => (cp.tipo === 'fecha' ? fecha((p.datos?.[cp.k] as string) ?? null) : num(p.datos?.[cp.k]))),
        txt(p.notas), txt(p.revisar),
      ])
    }
    hojas.push(filas)
    nombres.push(r.nombre.slice(0, 31))
  }
  const hist: Celda[][] = [cab(['Compañía', 'Rubro', 'Asegurado', 'DNI / CUIT', 'Póliza', 'Riesgo / detalle', 'Vence', 'Fecha baja', 'Motivo'])]
  for (const p of d.polizas.filter((x) => x.estado === 'baja')) {
    const c = p.cliente_id ? cli.get(p.cliente_id) : undefined
    hist.push([txt(ase.get(p.aseguradora_id ?? -1)), txt(rub.get(p.rubro_id ?? -1)?.nombre), txt(c?.nombre), txt(c?.doc),
      txt(p.numero), txt(p.detalle || (its.get(p.id) ?? []).join('; ')), fecha(p.vence), fecha(p.baja_fecha), txt(p.baja_motivo)])
  }
  hojas.push(hist)
  nombres.push('Histórico')
  const clis: Celda[][] = [cab(['Nombre', 'DNI / CUIT', 'Teléfono', 'Mail', 'Domicilio', 'Observaciones'])]
  for (const c of d.clientes) clis.push([txt(c.nombre), txt(c.doc), txt(c.telefono), txt(c.mail), txt(c.domicilio), txt(c.observaciones)])
  hojas.push(clis)
  nombres.push('Clientes')

  await (writeXlsxFile as unknown as (d: unknown, o: unknown) => Promise<void>)(hojas, {
    sheets: nombres, fileName: `Cartera_${hoyISO()}.xlsx`, stickyRowsCount: 1,
  })
}
