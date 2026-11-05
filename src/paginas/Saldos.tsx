import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Cuenta, MovimientoCuenta } from '../lib/tipos'
import { fechaCorta, fechaLarga, hoy, mensajeError, mesSiguiente, nombreMes, pesos, primerDiaMes } from '../lib/formato'
import { esDatafono, useCuentas } from '../lib/cuentas'
import { Aviso, CampoDinero, Cargando, Dialogo, useToast } from '../componentes/ui'
import { useSesion } from '../componentes/Sesion'
import { Icono } from '../componentes/Icono'
import { SelectorMes } from '../componentes/SelectorMes'

const rojo = (n: number) => (n < 0 ? { color: 'var(--alerta)' } : undefined)

export function Saldos() {
  const toast = useToast()
  const cuentas = useCuentas()
  const [movs, setMovs] = useState<MovimientoCuenta[] | null>(null)
  const [conApertura, setConApertura] = useState<Set<string>>(new Set())
  const [mes, setMes] = useState(primerDiaMes(hoy()))
  const [cuentaVer, setCuentaVer] = useState<string>('')
  const [trasladando, setTrasladando] = useState(false)
  const [abriendo, setAbriendo] = useState(false)

  const cargar = useCallback(async () => {
    const [m, a] = await Promise.all([
      supabase.from('v_movimientos_cuenta').select('*').order('fecha').order('creado_en', { nullsFirst: true }),
      supabase.from('saldos_apertura').select('cuenta_id'),
    ])
    setMovs((m.data ?? []) as MovimientoCuenta[])
    setConApertura(new Set((a.data ?? []).map(r => r.cuenta_id as string)))
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (!cuentaVer && cuentas.length) setCuentaVer(cuentas[0].id) }, [cuentas, cuentaVer])

  const hoyIso = hoy()
  const sig = mesSiguiente(mes)

  const saldoHoy = (id: string) => (movs ?? []).filter(m => m.cuenta_id === id && m.fecha <= hoyIso).reduce((s, m) => s + m.valor, 0)
  const totalHoy = cuentas.reduce((s, c) => s + saldoHoy(c.id), 0)
  const pendientes = cuentas.filter(c => !conApertura.has(c.id))

  // Resumen del mes por cuenta. La apertura cuenta como saldo inicial aunque caiga dentro del mes.
  const filasMes = useMemo(() => cuentas.map(c => {
    const de = (movs ?? []).filter(m => m.cuenta_id === c.id)
    const delMes = de.filter(m => m.fecha >= mes && m.fecha < sig)
    const suma = (xs: MovimientoCuenta[]) => xs.reduce((s, m) => s + m.valor, 0)
    const inicial = suma(de.filter(m => m.fecha < mes)) + suma(delMes.filter(m => m.tipo === 'Apertura'))
    const entradas = suma(delMes.filter(m => m.tipo === 'Venta'))
    const salidas = suma(delMes.filter(m => m.tipo === 'Gasto' || m.tipo === 'Retiro'))
    const traslados = suma(delMes.filter(m => m.tipo === 'Traslado'))
    return { cuenta: c, inicial, entradas, salidas, traslados, final: inicial + entradas + salidas + traslados }
  }), [cuentas, movs, mes, sig])

  const totales = filasMes.reduce((t, f) => ({
    inicial: t.inicial + f.inicial, entradas: t.entradas + f.entradas, salidas: t.salidas + f.salidas,
    traslados: t.traslados + f.traslados, final: t.final + f.final,
  }), { inicial: 0, entradas: 0, salidas: 0, traslados: 0, final: 0 })

  // Movimientos de la cuenta elegida en el mes, con saldo corrido.
  const detalle = useMemo(() => {
    const fila = filasMes.find(f => f.cuenta.id === cuentaVer)
    let saldo = fila?.inicial ?? 0
    return (movs ?? [])
      .filter(m => m.cuenta_id === cuentaVer && m.fecha >= mes && m.fecha < sig && m.tipo !== 'Apertura')
      .map(m => { saldo += m.valor; return { ...m, saldo } })
  }, [movs, cuentaVer, mes, sig, filasMes])

  if (!movs) return <Cargando />

  return (
    <>
      <div className="encabezado">
        <div><p className="antetitulo">Dónde está la plata</p><h1 className="impacto">Saldos</h1></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="boton" onClick={() => setTrasladando(true)}><Icono nombre="flecha" />Registrar traslado</button>
          <button className="boton contorno" onClick={() => setAbriendo(true)}>Saldo de apertura</button>
        </div>
      </div>

      {pendientes.length > 0 && (
        <Aviso tipo="info">
          {pendientes.length === cuentas.length ? 'Las cuentas arrancaron' : `${pendientes.map(c => c.nombre).join(', ')} arrancaron`} en $0
          el {fechaLarga('2026-11-01')}: los saldos muestran lo que entró y salió desde ahí, no lo que hay de verdad.
          Cuando tengas el saldo real de cada app, regístralo con "Saldo de apertura".
        </Aviso>
      )}

      <section className="tarjeta suave resumen" style={{ marginTop: 16 }}>
        <p className="antetitulo">Total en las cuentas hoy</p>
        <div className="cifra total" style={rojo(totalHoy)}>{pesos(totalHoy)}</div>
      </section>

      <div className="rejilla" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}>
        {cuentas.map(c => {
          const s = saldoHoy(c.id)
          return (
            <section key={c.id} className="tarjeta resumen">
              <p className="antetitulo">{c.nombre}</p>
              <div className="cifra total" style={rojo(s)}>{pesos(s)}</div>
              <div className="chips">
                {!conApertura.has(c.id) && <span className="sticker">Apertura pendiente</span>}
                {s < 0 && <span className="estado revisar">En negativo</span>}
              </div>
            </section>
          )
        })}
      </div>

      <section className="tarjeta" style={{ marginTop: 24 }}>
        <div className="encabezado" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Cuadre de {nombreMes(mes).toLowerCase()}</h2>
          <SelectorMes mes={mes} onCambio={setMes} />
        </div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr>
              <th>Cuenta</th><th className="num">Inicial</th><th className="num">+ Ventas</th>
              <th className="num">− Gastos y retiros</th><th className="num">± Traslados</th><th className="num">Final</th>
            </tr></thead>
            <tbody>
              {filasMes.map(f => (
                <tr key={f.cuenta.id}>
                  <td>{f.cuenta.nombre}</td>
                  <td className="num cifra" style={rojo(f.inicial)}>{pesos(f.inicial)}</td>
                  <td className="num cifra">{pesos(f.entradas)}</td>
                  <td className="num cifra">{pesos(-f.salidas)}</td>
                  <td className="num cifra">{pesos(f.traslados)}</td>
                  <td className="num cifra" style={rojo(f.final)}><strong>{pesos(f.final)}</strong></td>
                </tr>
              ))}
              <tr>
                <td><strong>Total</strong></td>
                <td className="num cifra"><strong>{pesos(totales.inicial)}</strong></td>
                <td className="num cifra"><strong>{pesos(totales.entradas)}</strong></td>
                <td className="num cifra"><strong>{pesos(-totales.salidas)}</strong></td>
                <td className="num cifra"><strong>{pesos(totales.traslados)}</strong></td>
                <td className="num cifra" style={rojo(totales.final)}><strong>{pesos(totales.final)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          El saldo final pasa solo como inicial del mes siguiente. Los traslados entre cuentas suman cero en el total,
          salvo la comisión, que queda como gasto. Los retiros de caja salen de las cuentas (efectivo guardado aparte).
        </p>
      </section>

      <section className="tarjeta" style={{ marginTop: 24 }}>
        <h2>Movimientos de {nombreMes(mes).toLowerCase()}</h2>
        <div className="segmentos" style={{ marginBottom: 12 }}>
          {cuentas.map(c => (
            <button key={c.id} type="button" aria-pressed={cuentaVer === c.id} onClick={() => setCuentaVer(c.id)}>{c.nombre}</button>
          ))}
        </div>
        {detalle.length === 0 ? <p className="vacio">Sin movimientos en este mes.</p> : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Movimiento</th><th className="num">Valor</th><th className="num">Saldo</th></tr></thead>
              <tbody>
                {detalle.map((m, i) => (
                  <tr key={i}>
                    <td>{fechaCorta(m.fecha)}</td>
                    <td>{m.tipo} · <span className="muted">{m.concepto}</span></td>
                    <td className="num cifra" style={rojo(m.valor)}>{pesos(m.valor)}</td>
                    <td className="num cifra" style={rojo(m.saldo)}>{pesos(m.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {trasladando && <Traslado cuentas={cuentas} onCerrar={() => setTrasladando(false)}
        onGuardado={m => { setTrasladando(false); cargar(); toast(m) }} />}
      {abriendo && <Apertura cuentas={cuentas} onCerrar={() => setAbriendo(false)}
        onGuardado={() => { setAbriendo(false); cargar(); toast('Saldo de apertura guardado') }} />}
    </>
  )
}

function Traslado({ cuentas, onCerrar, onGuardado }: { cuentas: Cuenta[]; onCerrar: () => void; onGuardado: (m: string) => void }) {
  const bold = cuentas.find(esDatafono)
  const [fecha, setFecha] = useState(hoy())
  const [origen, setOrigen] = useState(bold?.id ?? '')
  const [destino, setDestino] = useState(cuentas.find(c => c.nombre === 'Daviplata')?.id ?? '')
  const [sale, setSale] = useState(0)
  const [llega, setLlega] = useState(0)
  const [concepto, setConcepto] = useState(bold ? 'Liquidación Bold' : '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const comision = sale - llega
  const nombre = (id: string) => cuentas.find(c => c.id === id)?.nombre ?? ''

  const faltan: string[] = []
  if (!origen || !destino) faltan.push('las dos cuentas')
  if (origen && origen === destino) faltan.push('cuentas distintas')
  if (llega <= 0) faltan.push('cuánto llegó')
  if (sale < llega) faltan.push('que lo que sale no sea menor que lo que llega')
  if (concepto.trim().length < 3) faltan.push('concepto')

  async function guardar() {
    setGuardando(true); setError(null)
    const { error } = await supabase.rpc('registrar_traslado', {
      p_fecha: fecha, p_origen: origen, p_destino: destino, p_sale: sale, p_llega: llega, p_concepto: concepto,
    })
    setGuardando(false)
    if (error) setError(mensajeError(error))
    else onGuardado(`Traslado guardado: ${pesos(llega)} a ${nombre(destino)}${comision > 0 ? ` y comisión de ${pesos(comision)}` : ''}`)
  }

  return (
    <Dialogo titulo="Registrar traslado" onCerrar={onCerrar}>
      <p className="muted" style={{ marginTop: 0 }}>Plata que pasa de una cuenta a otra, como la liquidación de Bold a Daviplata. No es venta ni gasto.</p>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="campo">
          <label htmlFor="t-fecha">Fecha</label>
          <input id="t-fecha" type="date" className="entrada" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="campos">
          <div className="campo">
            <label htmlFor="t-origen">Sale de</label>
            <select id="t-origen" className="entrada" value={origen} onChange={e => setOrigen(e.target.value)}>
              <option value="">Elige…</option>
              {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="t-destino">Llega a</label>
            <select id="t-destino" className="entrada" value={destino} onChange={e => setDestino(e.target.value)}>
              <option value="">Elige…</option>
              {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <CampoDinero id="t-sale" etiqueta={`Sale de ${nombre(origen) || 'origen'}`} valor={sale}
            onCambio={n => { setSale(n); if (llega === 0 || llega === sale) setLlega(n) }} />
          <CampoDinero id="t-llega" etiqueta={`Llega a ${nombre(destino) || 'destino'}`} valor={llega} onCambio={setLlega}
            ayuda={comision > 0 ? `La diferencia (${pesos(comision)}) queda como gasto "Comisiones bancarias".` : 'Si hay comisión, pon lo que llegó de verdad.'} />
        </div>
        <div className="campo">
          <label htmlFor="t-concepto">Concepto</label>
          <input id="t-concepto" className="entrada" value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej. Liquidación Bold" />
        </div>
        {faltan.length > 0 && (sale > 0 || llega > 0) && <p className="muted" style={{ margin: 0 }}>Falta: {faltan.join(', ')}.</p>}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
      <div className="acciones">
        <button className="boton" disabled={guardando || faltan.length > 0} onClick={guardar}>
          <Icono nombre="ok" />{guardando ? 'Guardando…' : 'Guardar traslado'}
        </button>
        <button className="boton contorno" onClick={onCerrar}>Cancelar</button>
      </div>
    </Dialogo>
  )
}

function Apertura({ cuentas, onCerrar, onGuardado }: { cuentas: Cuenta[]; onCerrar: () => void; onGuardado: () => void }) {
  const { sesion } = useSesion()
  const [cuenta, setCuenta] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [valor, setValor] = useState(0)
  const [motivo, setMotivo] = useState('Saldo real según la app')
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const nombre = cuentas.find(c => c.id === cuenta)?.nombre ?? ''

  async function guardar() {
    setGuardando(true); setError(null)
    const { error } = await supabase.from('saldos_apertura').insert({
      cuenta_id: cuenta, fecha, valor, motivo: motivo.trim(), creado_por: sesion!.user.id,
    })
    setGuardando(false)
    if (error) setError(mensajeError(error)); else onGuardado()
  }

  return (
    <Dialogo titulo="Saldo de apertura" onCerrar={onCerrar}>
      <p className="muted" style={{ marginTop: 0 }}>
        El saldo real de una cuenta al terminar un día (míralo en la app del banco o cuenta la caja).
        Desde ahí la cuenta suma y resta normal; lo anterior a esa fecha ya está dentro de ese saldo.
        Si te equivocas, registra otro: vale el más reciente.
      </p>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="campos">
          <div className="campo">
            <label htmlFor="a-cuenta">Cuenta</label>
            <select id="a-cuenta" className="entrada" value={cuenta} onChange={e => setCuenta(e.target.value)}>
              <option value="">Elige…</option>
              {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="a-fecha">Saldo al terminar el día</label>
            <input id="a-fecha" type="date" className="entrada" value={fecha} min="2026-10-31" max={hoy()} onChange={e => setFecha(e.target.value)} />
            <span className="ayuda">Si lo miras antes del cierre de hoy, pon la fecha de ayer.</span>
          </div>
          <CampoDinero id="a-valor" etiqueta="Saldo" valor={valor} onCambio={setValor} />
        </div>
        <div className="campo">
          <label htmlFor="a-motivo">Nota</label>
          <input id="a-motivo" className="entrada" value={motivo} onChange={e => setMotivo(e.target.value)} />
        </div>
        {confirmar && (
          <Aviso tipo="info">{nombre} queda con {pesos(valor)} al terminar el {fechaLarga(fecha)}. Lo registrado en esa cuenta hasta ese día deja de sumarse al saldo.</Aviso>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
      <div className="acciones">
        {confirmar
          ? <button className="boton" disabled={guardando} onClick={guardar}><Icono nombre="ok" />{guardando ? 'Guardando…' : 'Confirmar'}</button>
          : <button className="boton" disabled={!cuenta || motivo.trim().length < 5} onClick={() => setConfirmar(true)}>Revisar</button>}
        <button className="boton contorno" onClick={onCerrar}>Cancelar</button>
      </div>
    </Dialogo>
  )
}
