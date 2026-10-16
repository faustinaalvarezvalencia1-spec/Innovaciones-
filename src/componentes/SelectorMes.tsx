import { mesAnterior, mesSiguiente, nombreMes, primerDiaMes, hoy } from '../lib/formato'
import { Icono } from './Icono'

export function SelectorMes({ mes, onCambio }: { mes: string; onCambio: (m: string) => void }) {
  const esActual = mes === primerDiaMes(hoy())
  return (
    <div className="selector-mes" role="group" aria-label="Mes">
      <button className="boton texto chico" onClick={() => onCambio(mesAnterior(mes))} aria-label="Mes anterior">
        <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icono nombre="flecha" /></span>
      </button>
      <strong>{nombreMes(mes)}</strong>
      <button className="boton texto chico" onClick={() => onCambio(mesSiguiente(mes))} disabled={esActual} aria-label="Mes siguiente">
        <Icono nombre="flecha" />
      </button>
    </div>
  )
}
