// Moneda COP sin decimales ($3.500) y fechas en America/Bogota.

const cop = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

export function pesos(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  const s = cop.format(Math.round(Math.abs(n)))
  return (n < 0 ? '−$' : '$') + s
}

export function numero(n: number | null | undefined, decimales = 2): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: decimales }).format(n)
}

/** Convierte "3.500" o "$ 3.500" en 3500. Vacío → 0. */
export function leerPesos(texto: string): number {
  const limpio = texto.replace(/[^\d-]/g, '')
  return limpio === '' || limpio === '-' ? 0 : parseInt(limpio, 10)
}

/** Acepta "12,5" o "12.5" para cantidades (gramos, metros). */
export function leerCantidad(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export const ZONA = 'America/Bogota'

/** Fecha de hoy en Bogotá como YYYY-MM-DD. */
export function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date())
}

export function primerDiaMes(fecha: string): string {
  return fecha.slice(0, 7) + '-01'
}

export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

export function nombreMes(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  const s = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** 1 = lunes … 7 = domingo */
export function diaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return w === 0 ? 7 : w
}

/** Semana de conteo (1–4) según el día del mes. */
export function semanaDeConteo(iso: string): 1 | 2 | 3 | 4 {
  const d = Number(iso.slice(8, 10))
  return Math.min(4, Math.ceil(d / 7)) as 1 | 2 | 3 | 4
}

export function mesSiguiente(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

export function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
}

export function mensajeError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = String((e as { message: string }).message)
    if (msg.includes('duplicate key') && msg.includes('cierres_fecha')) return 'Ya hay un cierre para esa fecha. Si hay que corregirlo, usa un ajuste.'
    if (msg.includes('row-level security')) return 'Tu usuario no tiene permiso para esta acción.'
    if (msg.includes('Failed to fetch')) return 'No hay conexión. Revisa el internet e intenta de nuevo.'
    return msg
  }
  return 'Algo salió mal. Intenta de nuevo.'
}
