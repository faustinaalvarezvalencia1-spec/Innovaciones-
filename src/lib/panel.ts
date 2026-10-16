import { supabase } from './supabase'
import type { Cierre, Gasto, GastoFijo } from './tipos'
import { diaSemana, hoy, mesAnterior, mesSiguiente, primerDiaMes } from './formato'

export interface DatosPanel {
  mes: string
  diaCorte: number
  esMesActual: boolean
  cierres: Cierre[]
  ventaMes: number
  ventaPrevMismoDia: number
  ventaPrevTotal: number
  medios: { efectivo: number; transferencias: number; datafono: number }
  ultimoCierre: Cierre | null
  gastos: Gasto[]
  gastosMes: number
  gastosPorCategoria: { categoria: string; valor: number }[]
  resultado: number
  margen: number
  fijosMensuales: number
  nominaEstimada: number
  diasHabiles: number
  diasHabilesRestantes: number
  puntoEquilibrio: number
  faltaEquilibrio: number
  fijosPendientes: { nombre: string; esperado: number; pagado: number; estimado: boolean; pendiente: boolean }[]
  revisar: Cierre[]
  diasSinCierre: string[]
  stockCritico: { id: string; nombre: string; referencia: string | null; stock_exhibicion: number; minimo: number; unidad: string }[]
  productosSinMinimo: number
}

const suma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)

function diasDelMes(mes: string): string[] {
  const out: string[] = []
  for (let d = mes; d < mesSiguiente(mes); ) {
    out.push(d)
    const [y, m, dd] = d.split('-').map(Number)
    const sig = new Date(Date.UTC(y, m - 1, dd + 1))
    d = sig.toISOString().slice(0, 10)
  }
  return out
}

export async function cargarPanel(mes: string): Promise<DatosPanel> {
  const prev = mesAnterior(mes)
  const hoyIso = hoy()
  const esMesActual = primerDiaMes(hoyIso) === mes

  const [cMes, cPrev, cUlt, g, gf, m, fest, crit, sinMin] = await Promise.all([
    supabase.from('v_cierres').select('*').gte('fecha', mes).lt('fecha', mesSiguiente(mes)).order('fecha'),
    supabase.from('v_cierres').select('fecha, venta_total').gte('fecha', prev).lt('fecha', mes),
    supabase.from('v_cierres').select('*').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('gastos').select('*').gte('fecha', mes).lt('fecha', mesSiguiente(mes)),
    supabase.from('gastos_fijos').select('*').eq('activo', true),
    supabase.from('meses').select('margen_bruto_estimado').eq('mes', mes).maybeSingle(),
    supabase.from('festivos').select('fecha').gte('fecha', mes).lt('fecha', mesSiguiente(mes)),
    supabase.from('v_stock_critico').select('id, nombre, referencia, stock_exhibicion, minimo, unidad').limit(8),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true).eq('minimo', 0),
  ])
  for (const r of [cMes, cPrev, cUlt, g, gf, m, fest, crit]) if (r.error) throw r.error

  const cierres = (cMes.data ?? []) as Cierre[]
  const gastos = (g.data ?? []) as Gasto[]
  const fijos = (gf.data ?? []) as GastoFijo[]
  const festivos = new Set((fest.data ?? []).map(f => f.fecha as string))

  const diaCorte = esMesActual ? Number(hoyIso.slice(8, 10)) : diasDelMes(mes).length

  const ventaMes = suma(cierres, c => c.venta_total)
  const prevFilas = (cPrev.data ?? []) as { fecha: string; venta_total: number }[]
  const ventaPrevMismoDia = suma(prevFilas.filter(c => Number(c.fecha.slice(8, 10)) <= diaCorte), c => c.venta_total)
  const ventaPrevTotal = suma(prevFilas, c => c.venta_total)

  const gastosMes = suma(gastos, x => x.valor)
  const porCat = new Map<string, number>()
  gastos.forEach(x => porCat.set(x.categoria, (porCat.get(x.categoria) ?? 0) + x.valor))
  const gastosPorCategoria = [...porCat].map(([categoria, valor]) => ({ categoria, valor }))
    .filter(x => x.valor !== 0).sort((a, b) => b.valor - a.valor)

  // Días hábiles: lunes a sábado, sin festivos.
  const habiles = diasDelMes(mes).filter(d => diaSemana(d) !== 7 && !festivos.has(d))
  const diasHabilesRestantes = esMesActual ? habiles.filter(d => d > hoyIso).length : 0
  const conCierre = new Set(cierres.map(c => c.fecha))
  const limite = esMesActual ? hoyIso : mesSiguiente(mes)
  const diasSinCierre = habiles.filter(d => d < limite && !conCierre.has(d))

  const margen = Number(m.data?.margen_bruto_estimado ?? 0.43)
  const fijosMensuales = suma(fijos.filter(f => f.frecuencia === 'Mensual'), f => f.valor_estimado)
  const nominaEstimada = suma(fijos.filter(f => f.frecuencia === 'Por día trabajado'), f => f.valor_estimado) * habiles.length
  const puntoEquilibrio = Math.round((fijosMensuales + nominaEstimada) / margen)

  const fijosPendientes = fijos.map(f => {
    const pagos = gastos.filter(x => x.gasto_fijo_id === f.id)
    const esperado = f.frecuencia === 'Mensual' ? f.valor_estimado : f.valor_estimado * cierres.length
    const pagado = suma(pagos, x => x.valor)
    // Un fijo de valor variable (servicios) cuenta como pagado con cualquier pago del mes.
    const pendiente = pagado <= 0 || (!f.valor_variable && pagado < esperado) || (f.frecuencia === 'Por día trabajado' && pagado < esperado)
    return { nombre: f.nombre, esperado, pagado, estimado: pagos.some(x => x.estimado), pendiente }
  }).filter(f => f.pendiente || f.estimado).sort((a, b) => (b.esperado - b.pagado) - (a.esperado - a.pagado))

  return {
    mes, diaCorte, esMesActual, cierres, ventaMes, ventaPrevMismoDia, ventaPrevTotal,
    medios: {
      efectivo: suma(cierres, c => c.efectivo),
      transferencias: suma(cierres, c => c.transferencias),
      datafono: suma(cierres, c => c.datafono),
    },
    ultimoCierre: esMesActual ? (cUlt.data ?? null) as Cierre | null : cierres[cierres.length - 1] ?? null,
    gastos, gastosMes, gastosPorCategoria,
    resultado: ventaMes - gastosMes,
    margen, fijosMensuales, nominaEstimada, diasHabiles: habiles.length, diasHabilesRestantes,
    puntoEquilibrio, faltaEquilibrio: Math.max(0, puntoEquilibrio - ventaMes),
    fijosPendientes,
    revisar: cierres.filter(c => c.estado === 'Revisar'),
    diasSinCierre,
    stockCritico: (crit.data ?? []) as DatosPanel['stockCritico'],
    productosSinMinimo: sinMin.count ?? 0,
  }
}
