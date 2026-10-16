import { NavLink, Outlet } from 'react-router-dom'
import { NOTION_URL } from '../lib/supabase'
import { Icono } from './Icono'
import { useSesion } from './Sesion'

const enlaces = [
  { a: '/', texto: 'Inicio', icono: 'inicio', admin: true },
  { a: '/cierre', texto: 'Cierre', icono: 'caja', admin: false },
  { a: '/gastos', texto: 'Gastos', icono: 'gasto', admin: true },
  { a: '/inventario', texto: 'Inventario', icono: 'inventario', admin: false },
  { a: '/ajustes', texto: 'Ajustes', icono: 'ajustes', admin: true },
]

export function Marco() {
  const { perfil, esAdmin, salir } = useSesion()
  const visibles = enlaces.filter(e => esAdmin || !e.admin)
  const clase = ({ isActive }: { isActive: boolean }) => (isActive ? 'activo' : undefined)

  return (
    <div className="app">
      <header className="barra">
        <div className="barra-in">
          <img className="logo" src="/brand/logo-rosado.png" alt="innovaciones" />
          <nav className="nav" aria-label="Secciones">
            {visibles.map(e => (
              <NavLink key={e.a} to={e.a} end={e.a === '/'} className={clase}>
                <Icono nombre={e.icono} tam={20} />{e.texto}
              </NavLink>
            ))}
          </nav>
          <div className="usuario">
            {esAdmin && (
              <a className="boton contorno chico" href={NOTION_URL} target="_blank" rel="noopener noreferrer" aria-label="Abrir Notion">
                <Icono nombre="externo" tam={18} /><span className="oculto-mediano" aria-hidden="true">Abrir Notion</span>
              </a>
            )}
            <span className="nombre">{perfil?.nombre}</span>
            <button className="boton texto" onClick={salir} aria-label="Cerrar sesión"><Icono nombre="salir" /></button>
          </div>
        </div>
      </header>

      <main className="contenido"><Outlet /></main>

      <nav className="nav-movil" aria-label="Secciones">
        {visibles.map(e => (
          <NavLink key={e.a} to={e.a} end={e.a === '/'} className={clase}>
            <Icono nombre={e.icono} tam={22} />{e.texto}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
