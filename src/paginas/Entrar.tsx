import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Aviso } from '../componentes/ui'

export function Entrar() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    setEnviando(false)
    if (error) setError(error.message.includes('Invalid login') ? 'Correo o contraseña incorrectos.'
      : error.message.includes('Email not confirmed') ? 'Esta cuenta aún no está confirmada. Pídele a la dueña que la confirme en Supabase.'
      : 'No pudimos entrar. Revisa la conexión e intenta de nuevo.')
  }

  return (
    <div className="portada">
      <svg className="formas" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <polygon points="0,0 190,0 0,210" fill="var(--forma-rosado)" />
        <polygon points="400,610 400,800 210,800" fill="var(--forma-purpura)" />
        <polygon points="400,0 400,150 290,0" fill="var(--forma-nina)" />
      </svg>
      <form className="caja" onSubmit={entrar}>
        <img src="/brand/logo-rosado.png" alt="innovaciones" />
        <p className="antetitulo">Administración</p>
        <h1 className="impacto">Hola de nuevo</h1>
        <p className="muted" style={{ marginTop: 6 }}>Entra para registrar caja, gastos e inventario.</p>
        <div style={{ display: 'grid', gap: 14, marginTop: 20 }}>
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
        </div>
      </form>
    </div>
  )
}
