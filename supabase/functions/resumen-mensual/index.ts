// Resumen mensual de Almacén Innovaciones → página nueva en Notion.
// La llama pg_cron el día 1 (ver migración 20261017000004). También se puede llamar a mano con
// { "mes": "2026-09-01" } y la misma cabecera x-cron-key.
// Secretos: NOTION_TOKEN (conexión interna de Notion). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const PAGINA_ADMIN = '3fb8bbab-a319-8178-b324-ee6b945e4f80'
const NOTION_VERSION = '2022-06-28'

const cop = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const pesos = (n: number | null | undefined) => (n == null ? '—' : (n < 0 ? '−$' : '$') + cop.format(Math.abs(Math.round(n))))
const pct = (n: number) => `${Math.round(n * 100)} %`
const num = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n)
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1]
const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))} ${nombreMes(iso).slice(0, 3)}`

// ── Bloques de Notion ──
type Bloque = Record<string, unknown>
const texto = (s: string, negrita = false) => ({ type: 'text', text: { content: s }, annotations: { bold: negrita } })
const h2 = (s: string): Bloque => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: [texto(s)] } })
const parrafo = (...partes: ReturnType<typeof texto>[]): Bloque => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: partes } })
const vineta = (s: string): Bloque => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [texto(s)] } })
const BOMBILLO = 'https://contabilidad-innovaciones.netlify.app/brand/bulb-rosado.png'
const aviso = (s: string, color: 'green_background' | 'red_background'): Bloque => ({
  object: 'block', type: 'callout',
  callout: { rich_text: [texto(s, true)], color, icon: { type: 'external', external: { url: BOMBILLO } } },
})
const tabla = (encabezado: string[], filas: string[][]): Bloque => ({
  object: 'block', type: 'table',
  table: {
    table_width: encabezado.length, has_column_header: true, has_row_header: false,
    children: [encabezado, ...filas].map(f => ({ object: 'block', type: 'table_row', table_row: { cells: f.map(c => [texto(c)]) } })),
  },
})

// deno-lint-ignore no-explicit-any
function construir(r: any): { titulo: string; bloques: Bloque[] } {
  const mes: string = r.mes
  const nombre = nombreMes(mes)
  const anio = mes.slice(0, 4)
  const v = r.ventas, va = r.ventas_ant
  const pe = Math.round((r.fijos_mensuales + r.nomina_dia * r.dias_habiles) / r.margen)
  const resultado = v.total - r.gastos_total
  const dif = v.total - pe
  const cambio = va.total > 0 ? v.total / va.total - 1 : null
  const mesAnt = MESES[(Number(mes.slice(5, 7)) + 10) % 12]
  const b: Bloque[] = []

  b.push(aviso(
    `Con ${v.dias} cierres, ${nombre} cerró en ${pesos(v.total)}` +
    (cambio != null ? `, ${pct(Math.abs(cambio))} ${cambio >= 0 ? 'más' : 'menos'} que ${mesAnt}` : '') +
    (dif >= 0 ? ` y superó el punto de equilibrio por ${pesos(dif)}.` : `. Faltaron ${pesos(-dif)} para el punto de equilibrio.`),
    dif >= 0 ? 'green_background' : 'red_background'))

  // Ventas
  b.push(h2('Ventas'))
  const parte = (x: number) => (v.total > 0 ? ` (${pct(x / v.total)})` : '')
  const ticket = v.facturas ? pesos(v.total / v.facturas) : 'Sin datos (faltan números de factura)'
  b.push(tabla(['Concepto', 'Valor'], [
    ['Venta total', pesos(v.total)],
    ['Efectivo', pesos(v.efectivo) + parte(v.efectivo)],
    ['Transferencias', pesos(v.transferencias) + parte(v.transferencias)],
    ['Datáfono', pesos(v.datafono) + parte(v.datafono)],
    ['# facturas', v.facturas ? `${v.facturas}${v.dias_con_facturas < v.dias ? ` (en ${v.dias_con_facturas} de ${v.dias} cierres)` : ''}` : 'Sin datos'],
    ['Ticket promedio', ticket],
    ['Días trabajados', `${v.dias} de ${r.dias_habiles} hábiles`],
    ['Promedio diario', v.dias ? pesos(v.total / v.dias) : '—'],
    [`Vs. ${mesAnt}`, va.total > 0 ? `${pesos(va.total)} (${cambio! >= 0 ? '+' : '−'}${pct(Math.abs(cambio!))})` : `Sin datos de ${mesAnt}`],
  ]))

  // Gastos
  b.push(h2(`Gastos: ${pesos(r.gastos_total)}${v.total > 0 ? ` (${pct(r.gastos_total / v.total)} de las ventas)` : ''}`))
  if (r.gastos_cat.length) {
    // deno-lint-ignore no-explicit-any
    b.push(tabla(['Categoría', 'Valor'], r.gastos_cat.map((x: any) => [x.categoria, pesos(x.valor)])))
  } else b.push(parrafo(texto('Sin gastos registrados.')))
  b.push(parrafo(texto('Gastos fijos: registrado vs. estimado', true)))
  // deno-lint-ignore no-explicit-any
  b.push(tabla(['Gasto fijo', 'Estimado', 'Registrado', 'Nota'], r.fijos.map((f: any) => {
    const nota = f.pagado <= 0 ? 'Sin registrar'
      : f.estimado ? 'Valor estimado'
      : f.pagado > f.esperado ? `Registrado ${pesos(f.pagado - f.esperado)} de más`
      : f.pagado < f.esperado && !f.variable ? `Faltan ${pesos(f.esperado - f.pagado)}` : 'OK'
    return [f.nombre, pesos(f.esperado) + (f.frecuencia === 'Por día trabajado' ? ` (${v.dias} días)` : ''), pesos(f.pagado), nota]
  })))

  // Resultado
  b.push(h2('Resultado'))
  b.push(tabla(['Concepto', 'Valor'], [
    ['Ventas − gastos', pesos(resultado)],
    ['Punto de equilibrio', `${pesos(pe)} = (${pesos(r.fijos_mensuales)} fijos + ${pesos(r.nomina_dia * r.dias_habiles)} nómina) ÷ ${pct(r.margen)}`],
    ['Diferencia', dif >= 0 ? `${pesos(dif)} por encima` : `${pesos(-dif)} por debajo`],
  ]))

  // Inventario
  b.push(h2('Inventario'))
  if (r.stock_critico_total > 0) {
    b.push(parrafo(texto(`Stock crítico: ${r.stock_critico_total} productos en o bajo el mínimo`, true)))
    // deno-lint-ignore no-explicit-any
    b.push(tabla(['Producto', 'Stock', 'Mínimo'], r.stock_critico.map((p: any) => [p.nombre, `${num(p.stock)} ${p.unidad}`, num(p.minimo)])))
  } else {
    b.push(vineta(`Stock crítico: ninguno.${r.sin_minimo ? ` ${r.sin_minimo} productos aún no tienen mínimo definido.` : ''}`))
  }
  const valorizado = (x: { n: number; valor: number; sin_costo: number }) =>
    x.n === 0 ? '0 registros' : `${x.n} registros · ${pesos(x.valor)}${x.sin_costo ? ` (${x.sin_costo} sin costo)` : ''}`
  b.push(vineta(`Mermas: ${valorizado(r.mermas)}.`))
  b.push(vineta(`Consumo de la reserva de clases: ${valorizado(r.consumo_clases)}.`))
  if (r.consumo_detalle.length) {
    // deno-lint-ignore no-explicit-any
    b.push(tabla(['Producto', 'Cantidad', 'Valor'], r.consumo_detalle.map((x: any) => [x.nombre, `${num(x.cantidad)} ${x.unidad}`, pesos(x.valor)])))
  }

  // Alertas
  b.push(h2('Alertas'))
  const alertas: string[] = []
  // deno-lint-ignore no-explicit-any
  if (r.revisar.length) alertas.push(`Cierres en "Revisar": ${r.revisar.map((x: any) => `${fechaCorta(x.fecha)} (${x.motivos.join(', ')})`).join('; ')}.`)
  if (r.sin_cierre.length) alertas.push(`Días hábiles sin cierre: ${r.sin_cierre.map(fechaCorta).join(', ')}.`)
  if (r.sin_medio.n) alertas.push(`${r.sin_medio.n} gastos sin medio de pago (${pesos(r.sin_medio.valor)}).`)
  if (r.estimados.n) alertas.push(`${r.estimados.n} gastos con valor estimado (${pesos(r.estimados.valor)}): corrígelos con el valor real.`)
  if (r.ajustes_cierre) alertas.push(`${r.ajustes_cierre} ajustes de cierre en el mes.`)
  if (!alertas.length) alertas.push('Sin alertas: todo cuadra.')
  alertas.forEach(a => b.push(vineta(a)))

  b.push(parrafo(texto(`Generado automáticamente el ${new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long' }).format(new Date())} desde la app de administración.`)))

  return { titulo: `Resumen ${nombre} ${anio}`, bloques: b }
}

function mesAnteriorBogota(): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const [y, m] = hoy.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
}

const responder = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { error: 'Usa POST' })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const llave = req.headers.get('x-cron-key') ?? ''
  const { data: ok } = await db.rpc('resumen_verificar_llave', { p_llave: llave })
  if (!ok) return responder(401, { error: 'No autorizado' })

  const token = Deno.env.get('NOTION_TOKEN')
  if (!token) return responder(500, { error: 'Falta el secreto NOTION_TOKEN' })

  const cuerpo = await req.json().catch(() => ({}))
  const mes: string = /^\d{4}-\d{2}-01$/.test(cuerpo?.mes ?? '') ? cuerpo.mes : mesAnteriorBogota()

  const { data: previo } = await db.rpc('resumen_registrado', { p_mes: mes })
  if (previo) return responder(200, { estado: 'ya existía', ...previo })

  const { data: r, error } = await db.rpc('resumen_mes', { p_mes: mes })
  if (error) return responder(500, { error: error.message })

  const { titulo, bloques } = construir(r)
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent: { page_id: PAGINA_ADMIN },
      properties: { title: { title: [texto(titulo)] } },
      children: bloques,
    }),
  })
  const pagina = await res.json()
  if (!res.ok) return responder(502, { error: 'Notion rechazó la página', detalle: pagina })

  await db.rpc('resumen_registrar', { p_mes: mes, p_page_id: pagina.id, p_url: pagina.url })
  return responder(200, { estado: 'creada', mes, titulo, url: pagina.url })
})
