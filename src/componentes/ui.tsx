import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { leerPesos } from '../lib/formato'
import { Icono } from './Icono'

/** Campo de dinero: muestra $3.500 mientras se escribe y entrega el número. */
export function CampoDinero({ id, etiqueta, valor, onCambio, ayuda, autoFocus }: {
  id: string; etiqueta: string; valor: number; onCambio: (n: number) => void; ayuda?: string; autoFocus?: boolean
}) {
  const texto = valor === 0 ? '' : '$' + new Intl.NumberFormat('es-CO').format(valor)
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} className="entrada dinero" inputMode="numeric" autoComplete="off" placeholder="$0"
        value={texto} autoFocus={autoFocus}
        onChange={e => onCambio(Math.max(0, leerPesos(e.target.value)))} />
      {ayuda && <span className="ayuda">{ayuda}</span>}
    </div>
  )
}

export function Aviso({ tipo, children }: { tipo: 'error' | 'info' | 'ok'; children: ReactNode }) {
  return (
    <div className={`aviso ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <Icono nombre={tipo === 'ok' ? 'ok' : 'alerta'} tam={18} />
      <div>{children}</div>
    </div>
  )
}

export function EstadoCierre({ estado }: { estado: 'OK' | 'Revisar' }) {
  return <span className={`estado ${estado === 'OK' ? 'ok' : 'revisar'}`}>{estado}</span>
}

export function Dialogo({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = ''; prev?.focus() }
  }, [onCerrar])
  return (
    <div className="velo" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo" ref={ref}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 id="dialogo-titulo">{titulo}</h2>
          <button className="boton texto" onClick={onCerrar} aria-label="Cerrar"><Icono nombre="cerrar" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

const ContextoToast = createContext<(m: string) => void>(() => {})

export function ProveedorToast({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const mostrar = useCallback((m: string) => {
    setMensaje(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMensaje(null), 3500)
  }, [])
  return (
    <ContextoToast.Provider value={mostrar}>
      {children}
      {mensaje && <div className="toast" role="status">{mensaje}</div>}
    </ContextoToast.Provider>
  )
}

export const useToast = () => useContext(ContextoToast)

export function Cargando() {
  return <div className="vacio" role="status">Cargando…</div>
}
