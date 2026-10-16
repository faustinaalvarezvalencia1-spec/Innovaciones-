import { useEffect, useRef, useState } from 'react'
import type { Cierre } from '../lib/tipos'
import { fechaCorta, pesos } from '../lib/formato'

// Paleta categórica validada (scripts/validate_palette.js, superficie #ffffff):
// banda de luminosidad, croma, separación para daltonismo (ΔE ≥ 22) y contraste ≥ 3:1.
export const SERIES = [
  { clave: 'efectivo', nombre: 'Efectivo', color: '#c7304a' },
  { clave: 'transferencias', nombre: 'Transferencias', color: '#5463d6' },
  { clave: 'datafono', nombre: 'Datáfono', color: '#b07800' },
] as const

type Clave = typeof SERIES[number]['clave']

function compacto(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  if (n >= 1000) return `$${Math.round(n / 1000)} mil`
  return pesos(n)
}

export function Leyenda() {
  return (
    <div className="leyenda">
      {SERIES.map(s => <span key={s.clave}><i style={{ background: s.color }} />{s.nombre}</span>)}
    </div>
  )
}

/** Barras apiladas de venta diaria por medio de pago, con tooltip por día. */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho] as const
}

export function VentaDiaria({ cierres }: { cierres: Cierre[] }) {
  const [activo, setActivo] = useState<number | null>(null)
  const [tabla, setTabla] = useState(false)
  const [ref, medido] = useAncho<HTMLDivElement>()
  if (cierres.length === 0) return <p className="vacio">Sin cierres este mes.</p>

  const alto = 230, izq = 56, abajo = 26, arriba = 10
  const ancho = Math.max(280, medido || 600)
  const max = Math.max(...cierres.map(c => Math.max(c.venta_total, c.efectivo + c.transferencias + c.datafono)), 1)
  const paso = max > 1_000_000 ? 500_000 : max > 400_000 ? 200_000 : 100_000
  const tope = Math.ceil(max / paso) * paso
  const y = (v: number) => arriba + (alto - arriba - abajo) * (1 - v / tope)
  const col = (ancho - izq) / cierres.length
  const barra = Math.max(4, Math.min(24, col - 4))
  const marcas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso)
  const c = activo != null ? cierres[activo] : null

  return (
    <div>
       <div className="grafico" style={{ position: 'relative' }} ref={ref}>
        <svg viewBox={`0 0 ${ancho} ${alto}`} width={ancho} height={alto} role="img" aria-label="Venta diaria por medio de pago"
          onMouseLeave={() => setActivo(null)}>
          {marcas.map(v => (
            <g key={v}>
              <line x1={izq} x2={ancho} y1={y(v)} y2={y(v)} stroke="rgba(47,52,64,.1)" />
              <text x={izq - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--gris-medio)">{compacto(v)}</text>
            </g>
          ))}
          {cierres.map((cie, i) => {
            const x = izq + i * col + (col - barra) / 2
            let base = 0
            const segmentos = SERIES.map(s => {
              const v = cie[s.clave as Clave] as number
              const y0 = y(base), y1 = y(base + v)
              base += v
              return { s, v, y0, y1 }
            }).filter(t => t.v > 0)
            const sinDesglose = cie.venta_total === 0 && (cie.venta_total_registrada ?? 0) > 0
            return (
              <g key={cie.id} onMouseEnter={() => setActivo(i)} onClick={() => setActivo(i)} style={{ cursor: 'pointer' }}>
                <rect x={izq + i * col} y={arriba} width={col} height={alto - arriba - abajo} fill={activo === i ? 'rgba(247,221,224,.6)' : 'transparent'} />
                {segmentos.map((t, k) => {
                  const ultimo = k === segmentos.length - 1
                  const h = Math.max(0, t.y0 - t.y1 - (ultimo ? 0 : 2))
                  return ultimo
                    ? <path key={t.s.clave} fill={t.s.color}
                        d={`M${x},${t.y0} V${t.y1 + Math.min(4, h)} q0,-4 4,-4 H${x + barra - 4} q4,0 4,4 V${t.y0} Z`} />
                    : <rect key={t.s.clave} x={x} y={t.y1 + 2} width={barra} height={h} fill={t.s.color} />
                })}
                {sinDesglose && <rect x={x} y={y(cie.venta_total_registrada!)} width={barra} height={y(0) - y(cie.venta_total_registrada!)}
                  fill="none" stroke="var(--gris-medio)" strokeDasharray="3 3" />}
                {(i % Math.ceil(cierres.length / Math.max(4, Math.floor((ancho - izq) / 34))) === 0) && (
                  <text x={x + barra / 2} y={alto - 8} textAnchor="middle" fontSize="11" fill="var(--gris-medio)">{Number(cie.fecha.slice(8))}</text>
                )}
              </g>
            )
          })}
          <line x1={izq} x2={ancho} y1={y(0)} y2={y(0)} stroke="var(--gris)" />
        </svg>
        {c && (
          <div className="tooltip" role="status">
            <strong>{fechaCorta(c.fecha)} · {pesos(c.venta_total)}</strong>
            {SERIES.map(s => <div key={s.clave}><i style={{ background: s.color }} />{s.nombre}<span>{pesos(c[s.clave as Clave] as number)}</span></div>)}
            {c.estado === 'Revisar' && <div className="muted">Revisar: {c.motivos_revisar.join(', ')}</div>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Leyenda />
        <button className="boton texto chico" onClick={() => setTabla(t => !t)} aria-expanded={tabla}>{tabla ? 'Ocultar tabla' : 'Ver como tabla'}</button>
      </div>
      {tabla && (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Día</th>{SERIES.map(s => <th key={s.clave} className="num">{s.nombre}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>
              {cierres.map(c => (
                <tr key={c.id}><td>{fechaCorta(c.fecha)}</td>
                  {SERIES.map(s => <td key={s.clave} className="num">{pesos(c[s.clave as Clave] as number)}</td>)}
                  <td className="num cifra">{pesos(c.venta_total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Barra 100 % de medios de pago con etiquetas directas. */
export function MediosPago({ medios }: { medios: Record<Clave, number> }) {
  const total = medios.efectivo + medios.transferencias + medios.datafono
  if (total === 0) return <p className="vacio">Sin ventas este mes.</p>
  return (
    <div>
      <div className="barra-100" role="img" aria-label={SERIES.map(s => `${s.nombre} ${Math.round(medios[s.clave] / total * 100)}%`).join(', ')}>
        {SERIES.map(s => medios[s.clave] > 0 && (
          <span key={s.clave} style={{ flexGrow: medios[s.clave], background: s.color }} />
        ))}
      </div>
      <ul className="lista" style={{ marginTop: 8 }}>
        {SERIES.map(s => (
          <li key={s.clave}>
            <span className="muestra" style={{ background: s.color }} />
            <span className="principal">{s.nombre}</span>
            <span className="derecha"><strong className="cifra">{Math.round(medios[s.clave] / total * 100)}%</strong> <span className="muted">{pesos(medios[s.clave])}</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barras horizontales de una sola serie (gastos por categoría). */
export function BarrasCategoria({ datos }: { datos: { categoria: string; valor: number }[] }) {
  if (datos.length === 0) return <p className="vacio">Sin gastos este mes.</p>
  const max = Math.max(...datos.map(d => d.valor), 1)
  return (
    <ul className="barras-h">
      {datos.map(d => (
        <li key={d.categoria}>
          <span className="nombre">{d.categoria}</span>
          <span className="pista"><span style={{ width: `${Math.max(1.5, d.valor / max * 100)}%` }} /></span>
          <span className="cifra valor">{pesos(d.valor)}</span>
        </li>
      ))}
    </ul>
  )
}
