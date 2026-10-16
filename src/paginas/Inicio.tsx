import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cargarPanel, type DatosPanel } from '../lib/panel'
import { fechaCorta, hoy, mensajeError, mesAnterior, nombreMes, numero, pesos, primerDiaMes } from '../lib/formato'
import { Aviso, Cargando, EstadoCierre } from '../componentes/ui'
import { SelectorMes } from '../componentes/SelectorMes'
import { BarrasCategoria, MediosPago, VentaDiaria } from '../componentes/Graficos'

const pct = (n: number) => `${Math.round(n * 100)}%`

function Cifra({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: string; detalle?: React.ReactNode; tono?: 'alerta' | 'ok' }) {
  return (
    <div className="tarjeta cifra-tarjeta">
      <p className="antetitulo">{etiqueta}</p>
      <div className="cifra grande" style={{ color: tono === 'alerta' ? 'var(--alerta)' : tono === 'ok' ? 'var(--ok)' : undefined }}>{valor}</div>
      {detalle && <div className="muted detalle">{detalle}</div>}
    </div>
  )
}

export function Inicio() {
  const [mes, setMes] = useState(primerDiaMes(hoy()))
  const [d, setD] = useState<DatosPanel | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setD(null); setError(null)
    cargarPanel(mes).then(x => { if (vivo) setD(x) }).catch(e => { if (vivo) setError(mensajeError(e)) })
    return () => { vivo = false }
  }, [mes])

  const nombre = nombreMes(mes).split(' ')[0].toLowerCase()
  const nombrePrev = nombreMes(mesAnterior(mes)).split(' ')[0].toLowerCase()

  return (
    <>
      <div className="encabezado">
        <div><p className="antetitulo">Panel</p><h1 className="impacto">{mes === primerDiaMes(hoy()) ? 'Así va' : 'Así cerró'} {nombre}</h1></div>
        <SelectorMes mes={mes} onCambio={setMes} />
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {!d && !error && <Cargando />}
      {d && <Contenido d={d} nombre={nombre} nombrePrev={nombrePrev} />}
    </>
  )
}

function Contenido({ d, nombre, nombrePrev }: { d: DatosPanel; nombre: string; nombrePrev: string }) {
  const cambio = d.ventaPrevMismoDia > 0 ? d.ventaMes / d.ventaPrevMismoDia - 1 : null
  const gastosSobreVentas = d.ventaMes > 0 ? d.gastosMes / d.ventaMes : null
  const avance = d.puntoEquilibrio > 0 ? Math.min(1, d.ventaMes / d.puntoEquilibrio) : 0
  const porDia = d.diasHabilesRestantes > 0 ? d.faltaEquilibrio / d.diasHabilesRestantes : null

  const frase = [
    `Con ${d.cierres.length} cierre${d.cierres.length === 1 ? '' : 's'}, ${nombre} ${d.esMesActual ? 'va' : 'cerró'} en ${pesos(d.ventaMes)}`,
    cambio != null ? `, ${pct(Math.abs(cambio))} ${cambio >= 0 ? 'más' : 'menos'} que ${nombrePrev}${d.esMesActual ? ' al mismo día' : ''}` : '',
    '. ',
    d.faltaEquilibrio > 0
      ? `Faltan ${pesos(d.faltaEquilibrio)} para el punto de equilibrio${porDia ? `: unos ${pesos(Math.ceil(porDia / 1000) * 1000)} por día hábil` : ''}.`
      : `Ya pasó el punto de equilibrio por ${pesos(d.ventaMes - d.puntoEquilibrio)}.`,
  ].join('')

  return (
    <>
      <p className="frase">{frase}</p>

      <div className="cifras">
        <Cifra etiqueta={`Venta de ${nombre}`} valor={pesos(d.ventaMes)}
          detalle={cambio != null
            ? <><strong style={{ color: cambio >= 0 ? 'var(--ok)' : 'var(--alerta)' }}>{cambio >= 0 ? '▲' : '▼'} {pct(Math.abs(cambio))}</strong> vs {pesos(d.ventaPrevMismoDia)} de {nombrePrev}{d.esMesActual ? ` al día ${d.diaCorte}` : ''}</>
            : `Sin datos de ${nombrePrev} para comparar`} />
        <Cifra etiqueta="Efectivo en caja" valor={pesos(d.ultimoCierre?.efectivo_en_caja)}
          tono={(d.ultimoCierre?.efectivo_en_caja ?? 0) < 0 ? 'alerta' : undefined}
          detalle={d.ultimoCierre ? `Último cierre: ${fechaCorta(d.ultimoCierre.fecha)}` : 'Sin cierres'} />
        <Cifra etiqueta="Gastos vs ventas" valor={gastosSobreVentas != null ? pct(gastosSobreVentas) : '—'}
          tono={gastosSobreVentas != null && gastosSobreVentas > 1 ? 'alerta' : undefined}
          detalle={`${pesos(d.gastosMes)} en gastos`} />
        <Cifra etiqueta="Resultado del mes" valor={pesos(d.resultado)} tono={d.resultado < 0 ? 'alerta' : 'ok'}
          detalle={d.gastos.length === 0 ? 'Aún no hay gastos registrados este mes' : 'Ventas − gastos registrados'} />
        <div className="tarjeta cifra-tarjeta suave">
          <p className="antetitulo">Punto de equilibrio</p>
          <div className="cifra grande">{pesos(d.puntoEquilibrio)}</div>
          <div className="progreso" role="progressbar" aria-valuenow={Math.round(avance * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance hacia el punto de equilibrio">
            <span style={{ width: `${avance * 100}%` }} />
          </div>
          <div className="muted detalle">
            {d.faltaEquilibrio > 0 ? <>Faltan <strong className="cifra" style={{ color: 'var(--gris)' }}>{pesos(d.faltaEquilibrio)}</strong></> : 'Superado'}
            {' · '}{pct(avance)} logrado
          </div>
        </div>
      </div>
      <p className="muted nota">
        Punto de equilibrio = (fijos mensuales {pesos(d.fijosMensuales)} + nómina {pesos(d.nominaEstimada)} por {d.diasHabiles} días hábiles) ÷ margen {pct(d.margen)}.
      </p>

      <div className="columnas" style={{ marginTop: 16 }}>
        <section className="tarjeta">
          <h2>Venta diaria por medio de pago</h2>
          <VentaDiaria cierres={d.cierres} />
        </section>
        <section className="tarjeta">
          <h2>Medios de pago</h2>
          <MediosPago medios={d.medios} />
        </section>
      </div>

      <div className="columnas" style={{ marginTop: 16 }}>
        <section className="tarjeta">
          <h2>Gastos por categoría</h2>
          <BarrasCategoria datos={d.gastosPorCategoria} />
        </section>
        <section className="tarjeta">
          <h2>Gastos fijos pendientes</h2>
          {d.fijosPendientes.length === 0 ? <p className="vacio">Todos los gastos fijos del mes están registrados.</p> : (
            <ul className="lista">
              {d.fijosPendientes.map(f => (
                <li key={f.nombre}>
                  <span className="principal"><strong>{f.nombre}</strong>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {f.pagado > 0 ? `Registrado ${pesos(f.pagado)} de ${pesos(f.esperado)}` : `Estimado ${pesos(f.esperado)}`}
                    </span>
                  </span>
                  {f.estimado ? <span className="sticker">Valor estimado</span>
                    : <span className="cifra derecha">{pesos(f.esperado - f.pagado)}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="acciones"><Link className="boton contorno chico" to="/gastos">Registrar gasto</Link></div>
        </section>
      </div>

      <div className="columnas" style={{ marginTop: 16 }}>
        <section className="tarjeta">
          <h2>Cierres para revisar</h2>
          {d.revisar.length === 0 && d.diasSinCierre.length === 0 && <p className="vacio">Todos los cierres cuadran.</p>}
          {d.revisar.length > 0 && (
            <ul className="lista">
              {d.revisar.map(c => (
                <li key={c.id}>
                  <span className="principal"><strong>{fechaCorta(c.fecha)}</strong>
                    <span className="muted" style={{ fontSize: 13 }}>{c.motivos_revisar.join(' · ')}</span></span>
                  <EstadoCierre estado={c.estado} />
                </li>
              ))}
            </ul>
          )}
          {d.diasSinCierre.length > 0 && (
            <Aviso tipo="info">Días hábiles sin cierre: {d.diasSinCierre.map(fechaCorta).join(', ')}.</Aviso>
          )}
          <div className="acciones"><Link className="boton contorno chico" to="/cierre">Ir a cierres</Link></div>
        </section>
        <section className="tarjeta">
          <h2>Stock crítico</h2>
          {d.stockCritico.length === 0
            ? <p className="vacio">{d.productosSinMinimo > 0 ? `Sin productos bajo el mínimo. ${d.productosSinMinimo} productos aún no tienen mínimo definido.` : 'Sin productos bajo el mínimo.'}</p>
            : (
              <ul className="lista">
                {d.stockCritico.map(p => (
                  <li key={p.id}>
                    <span className="principal"><strong>{p.referencia ?? p.nombre}</strong>
                      <span className="muted" style={{ fontSize: 13 }}>Mínimo {numero(p.minimo)}</span></span>
                    <span className="cifra derecha" style={{ color: 'var(--alerta)' }}>{numero(p.stock_exhibicion)}</span>
                  </li>
                ))}
              </ul>
            )}
          <div className="acciones"><Link className="boton contorno chico" to="/inventario">Ir a inventario</Link></div>
        </section>
      </div>
    </>
  )
}
