import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { INICIO_SALDOS, type Cierre, type Cuenta, type RepartoCierre } from '../lib/tipos'
import { esCaja, esDatafono, useCuentas } from '../lib/cuentas'
import { diaSemana, fechaCorta, fechaLarga, hoy, leerPesos, mensajeError, nombreMes, pesos, primerDiaMes, mesSiguiente } from '../lib/formato'
import { Aviso, CampoDinero, Dialogo, EstadoCierre, useToast } from '../componentes/ui'
import { useSesion } from '../componentes/Sesion'
import { Icono } from '../componentes/Icono'

interface Formulario {
  fecha: string
  desde: string
  hasta: string
  efectivo: number
  transferencias: number
  datafono: number
  base: number
  retiro: number
  observaciones: string
}

const vacio = (fecha: string, base: number, desde: string): Formulario => ({
  fecha, desde, hasta: '', efectivo: 0, transferencias: 0, datafono: 0, base, retiro: 0, observaciones: '',
})

export function CierreCaja() {
  const { esAdmin } = useSesion()
  const toast = useToast()
  const [f, setF] = useState<Formulario>(vacio(hoy(), 0, ''))
  const [gastosEfectivo, setGastosEfectivo] = useState(0)
  const [existente, setExistente] = useState<Cierre | null>(null)
  const [festivo, setFestivo] = useState<string | null>(null)
  const [cierres, setCierres] = useState<Cierre[]>([])
  const [confirmar, setConfirmar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ajustando, setAjustando] = useState<Cierre | null>(null)
  const cuentas = useCuentas()
  const [reparto, setReparto] = useState<Record<string, number>>({})
  const [tocadas, setTocadas] = useState<Set<string>>(new Set())

  const mes = primerDiaMes(f.fecha)
  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF(prev => ({ ...prev, [k]: v }))

  const cargarCierres = useCallback(async () => {
    const { data } = await supabase.from('v_cierres').select('*')
      .gte('fecha', mes).lt('fecha', mesSiguiente(mes)).order('fecha', { ascending: false })
    setCierres((data ?? []) as Cierre[])
  }, [mes])

  // Sugerencias al abrir: base del último cierre con base y factura siguiente.
  useEffect(() => {
    supabase.from('cierres').select('base_inicial, factura_hasta').order('fecha', { ascending: false }).limit(20)
      .then(({ data }) => {
        const filas = data ?? []
        const base = filas.find(r => r.base_inicial > 0)?.base_inicial ?? 0
        const ultima = filas.find(r => r.factura_hasta != null)?.factura_hasta
        setF(prev => ({ ...prev, base: prev.base || base, desde: prev.desde || (ultima ? String(ultima + 1) : '') }))
      })
  }, [])

  useEffect(() => { cargarCierres() }, [cargarCierres])

  useEffect(() => {
    let vivo = true
    supabase.rpc('gastos_efectivo_dia', { p_fecha: f.fecha }).then(({ data }) => { if (vivo) setGastosEfectivo(Number(data ?? 0)) })
    supabase.from('v_cierres').select('*').eq('fecha', f.fecha).maybeSingle()
      .then(({ data }) => { if (vivo) setExistente(data as Cierre | null) })
    if (esAdmin) {
      supabase.from('festivos').select('nombre').eq('fecha', f.fecha).maybeSingle()
        .then(({ data }) => { if (vivo) setFestivo(data?.nombre ?? null) })
    }
    return () => { vivo = false }
  }, [f.fecha, esAdmin])

  const venta = f.efectivo + f.transferencias + f.datafono
  const llevaReparto = f.fecha >= INICIO_SALDOS
  // Caja y datáfono se llenan solos con el efectivo y el datáfono, hasta que alguien los cambie a mano.
  const valorReparto = (c: Cuenta) => tocadas.has(c.id) ? (reparto[c.id] ?? 0)
    : esCaja(c) ? f.efectivo : esDatafono(c) ? f.datafono : (reparto[c.id] ?? 0)
  const repartoFilas = cuentas.map(c => ({ cuenta: c, valor: valorReparto(c) }))
  const sumaReparto = repartoFilas.reduce((s, r) => s + r.valor, 0)
  const porRepartir = venta - sumaReparto
  const cambiarReparto = (id: string, n: number) => {
    setReparto(p => ({ ...p, [id]: n }))
    setTocadas(p => new Set(p).add(id))
  }
  const caja = f.base + f.efectivo - gastosEfectivo - f.retiro
  const desde = f.desde ? parseInt(f.desde, 10) : null
  const hasta = f.hasta ? parseInt(f.hasta, 10) : null
  const numFacturas = desde && hasta && hasta >= desde ? hasta - desde + 1 : null

  const problemas = useMemo(() => {
    const p: string[] = []
    if (existente) p.push(`Ya hay un cierre del ${fechaCorta(f.fecha)}. Si hay que corregirlo, usa un ajuste en la lista de abajo.`)
    if (f.fecha > hoy()) p.push('La fecha está en el futuro.')
    if (desde && hasta && hasta < desde) p.push('La factura "hasta" es menor que la factura "desde".')
    if (caja < 0) p.push(`La caja queda negativa (${pesos(caja)}). Revisa el retiro o los gastos en efectivo.`)
    if (llevaReparto && cuentas.length === 0) p.push('No se cargaron las cuentas. Recarga la página.')
    if (llevaReparto && cuentas.length > 0 && porRepartir !== 0) {
      p.push(porRepartir > 0
        ? `Falta repartir ${pesos(porRepartir)} entre las cuentas.`
        : `El reparto se pasa ${pesos(-porRepartir)} de la venta.`)
    }
    return p
  }, [existente, f.fecha, desde, hasta, caja, llevaReparto, cuentas.length, porRepartir])

  const avisos = useMemo(() => {
    const a: string[] = []
    if (venta === 0) a.push('La venta está en $0. Si de verdad no hubo ventas, escríbelo en observaciones.')
    if (!desde || !hasta) a.push('Faltan los números de factura (desde y hasta).')
    if (diaSemana(f.fecha) === 7) a.push('Es domingo: normalmente la tienda no abre.')
    if (festivo) a.push(`Es festivo (${festivo}).`)
    return a
  }, [venta, desde, hasta, f.fecha, festivo])

  async function guardar() {
    setGuardando(true); setError(null)
    const { error } = await supabase.rpc('registrar_cierre', {
      p_fecha: f.fecha, p_factura_desde: desde, p_factura_hasta: hasta,
      p_efectivo: f.efectivo, p_transferencias: f.transferencias, p_datafono: f.datafono,
      p_base: f.base, p_retiro: f.retiro, p_observaciones: f.observaciones,
      p_reparto: llevaReparto ? repartoFilas.filter(r => r.valor > 0).map(r => ({ cuenta_id: r.cuenta.id, valor: r.valor })) : [],
    })
    setGuardando(false)
    if (error) { setError(mensajeError(error)); return }
    setConfirmar(false)
    toast(`Cierre del ${fechaCorta(f.fecha)} guardado: ${pesos(venta)}`)
    setF(vacio(f.fecha, f.base, hasta ? String(hasta + 1) : ''))
    setReparto({}); setTocadas(new Set())
    setExistente(null)
    cargarCierres()
    supabase.from('v_cierres').select('*').eq('fecha', f.fecha).maybeSingle().then(({ data }) => setExistente(data as Cierre | null))
  }

  return (
    <>
      <div className="encabezado">
        <div><p className="antetitulo">Registro diario</p><h1 className="impacto">Cierre de caja</h1></div>
      </div>

      <div className="columnas">
        <form className="tarjeta" onSubmit={e => { e.preventDefault(); if (!problemas.length) setConfirmar(true) }}>
          <div className="campos">
            <div className="campo">
              <label htmlFor="fecha">Fecha</label>
              <input id="fecha" type="date" className="entrada" value={f.fecha} max={hoy()} required
                onChange={e => set('fecha', e.target.value)} />
              <span className="ayuda">{fechaLarga(f.fecha)}</span>
            </div>
            <div className="campo">
              <label htmlFor="desde">Factura desde</label>
              <input id="desde" className="entrada" inputMode="numeric" value={f.desde}
                onChange={e => set('desde', e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="campo">
              <label htmlFor="hasta">Factura hasta</label>
              <input id="hasta" className="entrada" inputMode="numeric" value={f.hasta}
                aria-invalid={desde != null && hasta != null && hasta < desde}
                onChange={e => set('hasta', e.target.value.replace(/\D/g, ''))} />
              {numFacturas != null && <span className="ayuda">{numFacturas} facturas</span>}
            </div>
          </div>

          <p className="antetitulo" style={{ marginTop: 22 }}>Ventas del día</p>
          <div className="campos">
            <CampoDinero id="efectivo" etiqueta="Efectivo" valor={f.efectivo} onCambio={n => set('efectivo', n)} />
            <CampoDinero id="transferencias" etiqueta="Transferencias" valor={f.transferencias}
              onCambio={n => set('transferencias', n)} ayuda="Incluye WhatsApp" />
            <CampoDinero id="datafono" etiqueta="Datáfono" valor={f.datafono} onCambio={n => set('datafono', n)} />
          </div>

          {llevaReparto && (
            <>
              <p className="antetitulo" style={{ marginTop: 22 }}>Reparto por cuentas</p>
              <p className="muted" style={{ marginTop: -4, fontSize: 14 }}>
                Dónde quedó la plata del día. La caja y Bold se llenan solos; reparte las transferencias según a qué cuenta llegaron.
              </p>
              <div className="campos">
                {repartoFilas.map(({ cuenta, valor }) => (
                  <CampoDinero key={cuenta.id} id={`rep-${cuenta.id}`} etiqueta={cuenta.nombre} valor={valor}
                    onCambio={n => cambiarReparto(cuenta.id, n)} />
                ))}
              </div>
              <p className="ayuda" style={{ marginTop: 8, color: porRepartir !== 0 ? 'var(--alerta)' : undefined }}>
                {porRepartir === 0 ? `Repartido completo: ${pesos(sumaReparto)}`
                  : porRepartir > 0 ? `Falta repartir ${pesos(porRepartir)}` : `Sobran ${pesos(-porRepartir)}`}
              </p>
            </>
          )}

          <p className="antetitulo" style={{ marginTop: 22 }}>Caja</p>
          <div className="campos">
            <CampoDinero id="base" etiqueta="Base inicial" valor={f.base} onCambio={n => set('base', n)}
              ayuda="Lo que había en caja al abrir" />
            <div className="campo">
              <CampoDinero id="retiro" etiqueta="Retiro" valor={f.retiro} onCambio={n => set('retiro', n)}
                ayuda="Efectivo que sacas y guardas aparte" />
              <button type="button" className="boton texto chico" style={{ justifySelf: 'start' }}
                onClick={() => set('retiro', Math.max(0, f.efectivo - gastosEfectivo))}>
                Retirar el sobrante y dejar solo la base
              </button>
            </div>
          </div>

          <div className="campo ancho" style={{ marginTop: 14 }}>
            <label htmlFor="obs">Observaciones</label>
            <textarea id="obs" className="entrada" value={f.observaciones} onChange={e => set('observaciones', e.target.value)} />
          </div>

          {error && <div style={{ marginTop: 14 }}><Aviso tipo="error">{error}</Aviso></div>}
          <div className="acciones">
            <button className="boton bloque" disabled={problemas.length > 0}>Revisar y guardar</button>
          </div>
        </form>

        <div style={{ position: 'sticky', top: 90 }}>
          <div className="tarjeta suave resumen" aria-live="polite">
            <p className="antetitulo">Venta total</p>
            <div className="cifra total">{pesos(venta)}</div>
            <div className="fila"><span>Efectivo</span><span className="cifra">{pesos(f.efectivo)}</span></div>
            <div className="fila"><span>Transferencias</span><span className="cifra">{pesos(f.transferencias)}</span></div>
            <div className="fila"><span>Datáfono</span><span className="cifra">{pesos(f.datafono)}</span></div>
          </div>
          {llevaReparto && (
            <div className="tarjeta resumen" aria-live="polite">
              <p className="antetitulo">Reparto</p>
              {repartoFilas.map(r => (
                <div className="fila" key={r.cuenta.id}><span>{r.cuenta.nombre}</span><span className="cifra">{pesos(r.valor)}</span></div>
              ))}
              <div className="fila"><strong>Por repartir</strong>
                <strong className="cifra" style={{ color: porRepartir !== 0 ? 'var(--alerta)' : undefined }}>{pesos(porRepartir)}</strong></div>
            </div>
          )}
          <div className="tarjeta resumen" aria-live="polite">
            <p className="antetitulo">Efectivo en caja al cerrar</p>
            <div className="cifra total" style={{ color: caja < 0 ? 'var(--alerta)' : undefined }}>{pesos(caja)}</div>
            <div className="fila"><span>Base inicial</span><span className="cifra">{pesos(f.base)}</span></div>
            <div className="fila"><span>+ Efectivo</span><span className="cifra">{pesos(f.efectivo)}</span></div>
            <div className="fila"><span>− Gastos pagados con caja</span><span className="cifra">{pesos(gastosEfectivo)}</span></div>
            <div className="fila"><span>− Retiro</span><span className="cifra">{pesos(f.retiro)}</span></div>
          </div>
          <div style={{ marginTop: 16 }}>
            {problemas.map(p => <Aviso key={p} tipo="error">{p}</Aviso>)}
            {avisos.map(a => <Aviso key={a} tipo="info">{a}</Aviso>)}
            {!problemas.length && !avisos.length && venta > 0 && <Aviso tipo="ok">Todo cuadra.</Aviso>}
          </div>
        </div>
      </div>

      <div className="total-movil" aria-hidden="true">
        <span>Venta <strong className="cifra">{pesos(venta)}</strong></span>
        <span>Caja <strong className="cifra" style={{ color: caja < 0 ? 'var(--rosado-nina)' : undefined }}>{pesos(caja)}</strong></span>
      </div>

      <section className="tarjeta" style={{ marginTop: 24 }}>
        <h2>Cierres de {nombreMes(mes)}</h2>
        {cierres.length === 0 ? <p className="vacio">Todavía no hay cierres este mes.</p> : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead><tr>
                <th>Fecha</th><th className="num">Venta</th><th className="num oculto-movil">Facturas</th>
                <th className="num">En caja</th><th>Estado</th>{esAdmin && <th><span className="visually-hidden">Acciones</span></th>}
              </tr></thead>
              <tbody>
                {cierres.map(c => (
                  <tr key={c.id}>
                    <td>{fechaCorta(c.fecha)}{c.num_ajustes > 0 && <span className="muted" style={{ fontSize: 12 }}> · {c.num_ajustes} ajuste{c.num_ajustes > 1 ? 's' : ''}</span>}</td>
                    <td className="num cifra">{pesos(c.venta_total)}</td>
                    <td className="num oculto-movil">{c.num_facturas ?? '—'}</td>
                    <td className="num">{pesos(c.efectivo_en_caja)}</td>
                    <td><EstadoCierre estado={c.estado} />
                      {c.motivos_revisar.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{c.motivos_revisar.join(' · ')}</div>}</td>
                    {esAdmin && <td><button className="boton texto chico" onClick={() => setAjustando(c)}>Ajustar</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmar && (
        <Dialogo titulo={`Cierre del ${fechaLarga(f.fecha)}`} onCerrar={() => setConfirmar(false)}>
          <p className="muted" style={{ marginTop: 0 }}>Revisa antes de guardar. Después no se edita: solo se corrige con un ajuste.</p>
          <div className="resumen">
            <div className="fila"><span>Facturas</span><span>{desde ?? '—'} a {hasta ?? '—'}{numFacturas ? ` (${numFacturas})` : ''}</span></div>
            <div className="fila"><span>Efectivo</span><span className="cifra">{pesos(f.efectivo)}</span></div>
            <div className="fila"><span>Transferencias</span><span className="cifra">{pesos(f.transferencias)}</span></div>
            <div className="fila"><span>Datáfono</span><span className="cifra">{pesos(f.datafono)}</span></div>
            <div className="fila"><strong>Venta total</strong><strong className="cifra">{pesos(venta)}</strong></div>
            {llevaReparto && repartoFilas.filter(r => r.valor > 0).map(r => (
              <div className="fila" key={r.cuenta.id}><span>Queda en {r.cuenta.nombre}</span><span className="cifra">{pesos(r.valor)}</span></div>
            ))}
            <div className="fila"><span>Base inicial</span><span className="cifra">{pesos(f.base)}</span></div>
            <div className="fila"><span>Retiro</span><span className="cifra">{pesos(f.retiro)}</span></div>
            <div className="fila"><strong>Queda en caja</strong><strong className="cifra">{pesos(caja)}</strong></div>
          </div>
          {avisos.map(a => <Aviso key={a} tipo="info">{a}</Aviso>)}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="acciones">
            <button className="boton" onClick={guardar} disabled={guardando}><Icono nombre="ok" />{guardando ? 'Guardando…' : 'Guardar cierre'}</button>
            <button className="boton contorno" onClick={() => setConfirmar(false)}>Volver</button>
          </div>
        </Dialogo>
      )}

      {ajustando && <AjusteCierre cierre={ajustando} onCerrar={() => setAjustando(null)}
        onGuardado={() => { setAjustando(null); cargarCierres(); toast('Ajuste registrado') }} />}
    </>
  )
}

const CAMPOS_AJUSTE = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'transferencias', texto: 'Transferencias' },
  { valor: 'datafono', texto: 'Datáfono' },
  { valor: 'base_inicial', texto: 'Base inicial' },
  { valor: 'retiro', texto: 'Retiro' },
  { valor: 'reparto', texto: 'Reparto por cuenta' },
] as const

function AjusteCierre({ cierre, onCerrar, onGuardado }: { cierre: Cierre; onCerrar: () => void; onGuardado: () => void }) {
  const { sesion } = useSesion()
  const cuentas = useCuentas()
  const [campo, setCampo] = useState<typeof CAMPOS_AJUSTE[number]['valor']>('efectivo')
  const [cuentaId, setCuentaId] = useState('')
  const [reparto, setReparto] = useState<RepartoCierre[]>([])
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const conReparto = cierre.fecha >= INICIO_SALDOS
  const campos = CAMPOS_AJUSTE.filter(c => c.valor !== 'reparto' || conReparto)

  useEffect(() => {
    if (!conReparto) return
    supabase.from('reparto_cierre').select('*').eq('cierre_id', cierre.id)
      .then(({ data }) => setReparto((data ?? []) as RepartoCierre[]))
  }, [cierre.id, conReparto])

  const enCuenta = (id: string) => reparto.filter(r => r.cuenta_id === id).reduce((s, r) => s + r.valor, 0)
  const actual = campo === 'reparto' ? (cuentaId ? enCuenta(cuentaId) : 0) : cierre[campo]
  const diferencia = leerPesos(texto)
  const descuadre = cierre.venta_total - cierre.reparto_total

  async function guardar() {
    setGuardando(true); setError(null)
    const { error } = campo === 'reparto'
      ? await supabase.from('reparto_cierre').insert({
          cierre_id: cierre.id, cuenta_id: cuentaId, valor: diferencia, es_ajuste: true,
          motivo: motivo.trim(), creado_por: sesion!.user.id,
        })
      : await supabase.from('ajustes_cierre').insert({
          cierre_id: cierre.id, campo, diferencia, motivo: motivo.trim(), creado_por: sesion!.user.id,
        })
    setGuardando(false)
    if (error) setError(mensajeError(error)); else onGuardado()
  }

  const valido = diferencia !== 0 && motivo.trim().length >= 5 && (campo !== 'reparto' || !!cuentaId)

  return (
    <Dialogo titulo={`Ajustar cierre del ${fechaCorta(cierre.fecha)}`} onCerrar={onCerrar}>
      <p className="muted" style={{ marginTop: 0 }}>El cierre original no se modifica: se suma este ajuste con su motivo.</p>
      {conReparto && descuadre !== 0 && (
        <Aviso tipo="info">El reparto por cuentas no cuadra con la venta: {descuadre > 0 ? `falta repartir ${pesos(descuadre)}` : `sobran ${pesos(-descuadre)}`}. Ajústalo en "Reparto por cuenta".</Aviso>
      )}
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="campo">
          <span className="etiqueta">Qué valor corriges</span>
          <div className="segmentos">
            {campos.map(c => (
              <button key={c.valor} type="button" aria-pressed={campo === c.valor} onClick={() => setCampo(c.valor)}>{c.texto}</button>
            ))}
          </div>
          {conReparto && ['efectivo', 'transferencias', 'datafono'].includes(campo) && (
            <span className="ayuda">Si cambia la venta, registra también un ajuste en "Reparto por cuenta" para que cuadre.</span>
          )}
        </div>
        {campo === 'reparto' && (
          <div className="campo">
            <label htmlFor="aj-cuenta">Cuenta</label>
            <select id="aj-cuenta" className="entrada" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
              <option value="">Elige…</option>
              {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre} · {pesos(enCuenta(c.id))}</option>)}
            </select>
          </div>
        )}
        <div className="campo">
          <label htmlFor="dif">Diferencia (usa − para restar)</label>
          <input id="dif" className="entrada dinero" inputMode="text" placeholder="Ej. 20000 o -5000"
            value={texto} onChange={e => setTexto(e.target.value)} />
          <span className="ayuda">Ahora: {pesos(actual)} → queda {pesos(actual + diferencia)}</span>
        </div>
        <div className="campo">
          <label htmlFor="motivo">Motivo</label>
          <textarea id="motivo" className="entrada" value={motivo} onChange={e => setMotivo(e.target.value)} />
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
      <div className="acciones">
        <button className="boton" disabled={guardando || !valido} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Registrar ajuste'}
        </button>
        <button className="boton contorno" onClick={onCerrar}>Cancelar</button>
      </div>
    </Dialogo>
  )
}
