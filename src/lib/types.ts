export type Id = number

export interface Opcion {
  v: string
  cierra?: boolean // gestión: deja de avisar (Renovado, No renueva)
  alerta?: boolean // estado de cuota: requiere revisar (Pendiente, Impaga)
  accion?: boolean // renovación: requiere acción (Manual, Cupones)
}

export interface Config {
  dias_aviso: number
  dias_historico: number
  dias_cuota: number
  gestion: Opcion[]
  estado_cuota: Opcion[]
  renovacion: Opcion[]
}

export type TipoCampo = 'texto' | 'numero' | 'fecha' | 'opciones' | 'largo'
export interface Campo {
  k: string
  label: string
  tipo: TipoCampo
  opciones?: string[]
}

export interface Rubro {
  id: Id
  nombre: string
  orden: number
  usa_items: boolean
  campos: Campo[]
  activo: boolean
}

export interface Contacto {
  tramite: string
  dato?: string | null
  telefono?: string | null
}

export interface Aseguradora {
  id: Id
  nombre: string
  variantes: string[]
  web: string | null
  portal: string | null
  contactos: Contacto[]
  activa: boolean
}

export interface Cliente {
  id: Id
  nombre: string
  doc: string | null
  mail: string | null
  telefono: string | null
  domicilio: string | null
  observaciones: string | null
}

export interface Poliza {
  id: Id
  cliente_id: Id | null
  aseguradora_id: Id | null
  rubro_id: Id | null
  numero: string | null
  detalle: string | null
  desde: string | null // AAAA-MM-DD
  vence: string | null
  fin_anual: string | null
  renovacion: string | null
  gestion: string | null
  estado_cuota: string | null
  prox_vto_cuota: string | null
  datos: Record<string, unknown>
  notas: string | null
  estado: 'activa' | 'baja'
  baja_motivo: string | null
  baja_fecha: string | null
  revisar: string | null
  renovada_de: Id | null
  origen: string | null
  updated_at?: string
  updated_by?: string | null
}

export interface Item {
  id: Id
  poliza_id: Id
  patente: string | null
  detalle: string | null
  datos: Record<string, unknown>
}

export interface Usuario {
  email: string
  nombre: string | null
  rol: 'admin' | 'usuario'
}

export interface Libro {
  id: Id
  categoria: string | null
  titulo: string
  url: string | null
}

export interface Datos {
  config: Config
  rubros: Rubro[]
  aseguradoras: Aseguradora[]
  clientes: Cliente[]
  polizas: Poliza[]
  items: Item[]
  usuarios: Usuario[]
  biblioteca: Libro[]
}

export type Tabla = 'rubros' | 'aseguradoras' | 'clientes' | 'polizas' | 'poliza_items' | 'usuarios' | 'biblioteca'

export const CONFIG_DEFECTO: Config = {
  dias_aviso: 15,
  dias_historico: 30,
  dias_cuota: 7,
  gestion: [
    { v: 'Sin gestionar' }, { v: 'Contactado' }, { v: 'Cotizando' },
    { v: 'Renovado', cierra: true }, { v: 'No renueva', cierra: true },
  ],
  estado_cuota: [{ v: 'Al día' }, { v: 'Pendiente', alerta: true }, { v: 'Impaga', alerta: true }],
  renovacion: [{ v: 'Automática' }, { v: 'Manual', accion: true }, { v: 'Cupones', accion: true }],
}
