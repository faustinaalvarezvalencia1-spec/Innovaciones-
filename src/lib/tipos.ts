export type Rol = 'admin' | 'operador' | 'pendiente'

export interface Perfil { id: string; nombre: string; rol: Rol; activo: boolean }

export interface Cierre {
  id: string
  fecha: string
  factura_desde: number | null
  factura_hasta: number | null
  efectivo: number
  transferencias: number
  datafono: number
  base_inicial: number
  retiro: number
  venta_total_registrada: number | null
  observaciones: string | null
  num_ajustes: number
  gastos_efectivo_dia: number | null
  venta_total: number
  num_facturas: number | null
  efectivo_en_caja: number | null
  estado: 'OK' | 'Revisar'
  motivos_revisar: string[]
}

export const CATEGORIAS_GASTO = ['Nómina', 'Arriendo', 'Servicios', 'Plataformas', 'Compra de mercancía', 'Mantenimiento',
  'Papelería', 'Exhibición y mobiliario', 'Publicidad', 'Transporte', 'Impuestos', 'Otros'] as const

export const MEDIOS_PAGO = ['Efectivo de caja', 'Débito bancario', 'Transferencia', 'Cuenta personal', 'Tarjeta', 'Sin definir'] as const

export interface Gasto {
  id: string
  fecha: string
  categoria: string
  tipo: 'Fijo' | 'Variable'
  proveedor_id: string | null
  beneficiario: string | null
  gasto_fijo_id: string | null
  concepto: string
  valor: number
  medio_pago: string
  soporte_url: string | null
  es_ajuste: boolean
  ajusta_gasto_id: string | null
  motivo_ajuste: string | null
  estimado: boolean
  proveedores?: { nombre: string } | null
}

export interface GastoFijo {
  id: string; nombre: string; categoria: string; valor_estimado: number; dia_pago: number | null
  frecuencia: 'Mensual' | 'Por día trabajado'; valor_variable: boolean; activo: boolean
}

export interface Proveedor { id: string; nombre: string; que_vende: string | null; medio_pago_habitual: string | null; contacto: string | null; activo: boolean }

export const UNIDADES = ['Unidad', 'Gramo', 'Paquete', 'Tubo', 'Metro', 'Tira', 'Docena', 'Pieza', 'Paquete x100'] as const

export interface Producto {
  id: string
  nombre: string
  referencia: string | null
  categoria: 'Miyuki' | 'Herramientas'
  subcategoria: string | null
  unidad: string
  costo_unitario: number | null
  precio: number | null
  stock_exhibicion: number
  stock_reserva_clases: number
  minimo: number
  ultimo_conteo: string | null
  remate: boolean
  grupo_conteo: string | null
  proveedor_id: string | null
  activo: boolean
}

export const TIPOS_MOVIMIENTO = ['Entrada compra', 'Conteo', 'Traslado a reserva clases', 'Consumo en clase', 'Daño/merma', 'Ajuste'] as const
export type TipoMovimiento = typeof TIPOS_MOVIMIENTO[number]

export interface Movimiento {
  id: string
  fecha: string
  producto_id: string
  tipo: TipoMovimiento
  cantidad: number
  ubicacion: 'Exhibición' | 'Reserva clases'
  costo_unitario: number | null
  clase_tecnica: string | null
  motivo: string | null
  stock_anterior: number | null
  stock_resultante: number | null
  creado_en: string
  productos?: { nombre: string; referencia: string | null; unidad: string } | null
}
