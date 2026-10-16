import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './estilos.css'
import { ProveedorSesion, useSesion } from './componentes/Sesion'
import { Cargando, ProveedorToast } from './componentes/ui'
import { Marco } from './componentes/Marco'
import { Entrar } from './paginas/Entrar'
import { Inicio } from './paginas/Inicio'
import { CierreCaja } from './paginas/CierreCaja'
import { Gastos } from './paginas/Gastos'
import { Inventario } from './paginas/Inventario'
import { Ajustes } from './paginas/Ajustes'

function SoloAdmin({ children }: { children: ReactNode }) {
  const { esAdmin } = useSesion()
  return esAdmin ? children : <Navigate to="/cierre" replace />
}

function Rutas() {
  const { cargando, sesion, perfil } = useSesion()
  if (cargando) return <div className="portada"><Cargando /></div>
  if (!sesion) return <Entrar />
  if (!perfil || perfil.rol === 'pendiente' || !perfil.activo) {
    return (
      <div className="portada">
        <div className="caja">
          <img src="/brand/logo-rosado.png" alt="innovaciones" />
          <h1 className="impacto">Cuenta sin acceso</h1>
          <p className="muted">Tu cuenta existe, pero todavía no tiene un rol asignado. Pídele a la dueña que te dé acceso.</p>
        </div>
      </div>
    )
  }
  return (
    <Routes>
      <Route element={<Marco />}>
        <Route index element={<SoloAdmin><Inicio /></SoloAdmin>} />
        <Route path="cierre" element={<CierreCaja />} />
        <Route path="gastos" element={<SoloAdmin><Gastos /></SoloAdmin>} />
        <Route path="inventario" element={<Inventario />} />
        <Route path="ajustes" element={<SoloAdmin><Ajustes /></SoloAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorSesion>
        <ProveedorToast>
          <Rutas />
        </ProveedorToast>
      </ProveedorSesion>
    </BrowserRouter>
  </StrictMode>,
)
