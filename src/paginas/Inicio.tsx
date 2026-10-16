import { Link } from 'react-router-dom'

// El panel completo llega en la Fase 5.
export function Inicio() {
  return (
    <>
      <div className="encabezado">
        <div><p className="antetitulo">Panel</p><h1 className="impacto">Inicio</h1></div>
      </div>
      <div className="tarjeta suave">
        <p style={{ margin: 0 }}>El panel con las cifras del mes se construye en la siguiente fase. Por ahora puedes registrar:</p>
        <div className="acciones">
          <Link className="boton" to="/cierre">Cierre de caja</Link>
          <Link className="boton contorno" to="/gastos">Gastos</Link>
          <Link className="boton contorno" to="/inventario">Inventario</Link>
        </div>
      </div>
    </>
  )
}
