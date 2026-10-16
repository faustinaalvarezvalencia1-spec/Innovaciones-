import { useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Aviso } from '../componentes/ui'
import { useSesion } from '../componentes/Sesion'

export function Portada({ children }: { children: ReactNode }) {
  return (
    <div className="portada">
      <svg className="formas" viewBox="0 0 400 800" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="0,0 190,0 0,210" fill="var(--forma-rosado)" />
        <polygon points="400,610 400,800 210,800" fill="var(--forma-purpura)" />
        <polygon points="400,0 400,150 290,0" fill="var(--forma-nina)" />
      </svg>
      <div className="caja">
        <img src="/brand/logo-rosado.png" alt="innovaciones" />
        {children}
      </div>
    </div>
  )
}

export function Entrar() {
  const [modo, setModo] = useState<'entrar' | 'clave'>('entrar')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    setEnviando(false)
    if (error) setError(error.message.includes('Invalid login') ? 'Correo o contraseña incorrectos. Si nunca creaste contraseña, usa “Crear o recuperar contraseña”.'
      : error.message.includes('Email not confirmed') ? 'Esta cuenta aún no está confirmada. Pídele a la dueña que la confirme en Supabase.'
      : 'No pudimos entrar. Revisa la conexión e intenta de nuevo.')
  }

  async function pedirEnlace(e: FormEvent) {
    e.preventDefault()
    setEnviando(true); setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), { redirectTo: window.location.origin })
    setEnviando(false)
    if (error) setError(error.message.toLowerCase().includes('rate') ? 'Se pidieron muchos enlaces seguidos. Espera unos minutos e intenta de nuevo.'
      : 'No pudimos enviar el enlace. Revisa el correo y la conexión.')
    else setEnviado(true)
  }

  if (modo === 'clave') {
    return (
      <Portada>
        <p className="antetitulo">Contraseña</p>
        <h1 className="impacto">Crea tu clave</h1>
        {enviado ? (
          <>
            <Aviso tipo="ok">Si <strong>{correo}</strong> tiene cuenta, te llegó un correo con un enlace. Ábrelo en este mismo dispositivo para crear tu contraseña.</Aviso>
            <p className="muted" style={{ fontSize: 14 }}>Si no lo ves en unos minutos, revisa la carpeta de spam.</p>
          </>
        ) : (
          <form onSubmit={pedirEnlace} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <p className="muted" style={{ margin: 0 }}>Te enviamos un enlace al correo para crear o cambiar tu contraseña.</p>
            <div className="campo">
              <label htmlFor="correo-clave">Correo</label>
              <input id="correo-clave" className="entrada" type="email" autoComplete="username" required
                value={correo} onChange={e => setCorreo(e.target.value)} />
            </div>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <button className="boton bloque" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviarme el enlace'}</button>
          </form>
        )}
        <button className="boton texto" style={{ marginTop: 12 }} onClick={() => { setModo('entrar'); setEnviado(false); setError(null) }}>
          Volver a entrar
        </button>
      </Portada>
    )
  }

  return (
    <Portada>
      <p className="antetitulo">Administración</p>
      <h1 className="impacto">Hola de nuevo</h1>
      <p className="muted" style={{ marginTop: 6 }}>Entra para registrar caja, gastos e inventario.</p>
      <form onSubmit={entrar} style={{ display: 'grid', gap: 14, marginTop: 20 }}>
        <div className="campo">
          <label htmlFor="correo">Correo</label>
          <input id="correo" className="entrada" type="email" autoComplete="username" required
            value={correo} onChange={e => setCorreo(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="clave">Contraseña</label>
          <input id="clave" className="entrada" type="password" autoComplete="current-password" required
            value={clave} onChange={e => setClave(e.target.value)} />
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <button className="boton bloque" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <button className="boton texto" style={{ marginTop: 12 }} onClick={() => { setModo('clave'); setError(null) }}>
        Crear o recuperar contraseña
      </button>
    </Portada>
  )
}

export function NuevaClave() {
  const { sesion, terminarClave } = useSesion()
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const problema = clave.length > 0 && clave.length < 8 ? 'Usa al menos 8 caracteres.'
    : repetir.length > 0 && repetir !== clave ? 'Las dos contraseñas no coinciden.' : null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password: clave })
    setGuardando(false)
    if (error) setError(error.message.includes('different from the old') ? 'La nueva contraseña debe ser distinta a la anterior.'
      : error.message.toLowerCase().includes('weak') ? 'Esa contraseña es muy débil. Mezcla letras y números.'
      : 'No pudimos guardar la contraseña. Pide un enlace nuevo e intenta otra vez.')
    else {
      window.history.replaceState(null, '', '/')
      terminarClave()
    }
  }

  if (!sesion) {
    return (
      <Portada>
        <h1 className="impacto">Enlace vencido</h1>
        <p className="muted">Este enlace ya no sirve. Pide uno nuevo desde “Crear o recuperar contraseña”.</p>
        <button className="boton bloque" onClick={() => { window.history.replaceState(null, '', '/'); terminarClave() }}>Volver</button>
      </Portada>
    )
  }

  return (
    <Portada>
      <p className="antetitulo">{sesion.user.email}</p>
      <h1 className="impacto">Nueva contraseña</h1>
      <form onSubmit={guardar} style={{ display: 'grid', gap: 14, marginTop: 20 }}>
        <div className="campo">
          <label htmlFor="nueva">Contraseña</label>
          <input id="nueva" className="entrada" type="password" autoComplete="new-password" required minLength={8}
            value={clave} onChange={e => setClave(e.target.value)} />
          <span className="ayuda">Mínimo 8 caracteres.</span>
        </div>
        <div className="campo">
          <label htmlFor="repetir">Repítela</label>
          <input id="repetir" className="entrada" type="password" autoComplete="new-password" required
            value={repetir} onChange={e => setRepetir(e.target.value)} />
        </div>
        {(problema || error) && <Aviso tipo="error">{problema ?? error}</Aviso>}
        <button className="boton bloque" disabled={guardando || !!problema || clave.length < 8 || clave !== repetir}>
          {guardando ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
    </Portada>
  )
}
