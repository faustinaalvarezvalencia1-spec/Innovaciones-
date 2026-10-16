import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/tipos'

interface EstadoSesion {
  cargando: boolean
  sesion: Session | null
  perfil: Perfil | null
  esAdmin: boolean
  /** true cuando la persona llegó desde el enlace del correo para crear o cambiar la contraseña */
  creandoClave: boolean
  terminarClave: () => void
  salir: () => Promise<void>
}

const Contexto = createContext<EstadoSesion | null>(null)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const [creandoClave, setCreandoClave] = useState(() => window.location.hash.includes('type=recovery'))

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setCreandoClave(true)
      setSesion(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let vivo = true
    if (!sesion) { setPerfil(null); setCargando(false); return }
    setCargando(true)
    supabase.from('perfiles').select('id, nombre, rol, activo').eq('id', sesion.user.id).maybeSingle()
      .then(({ data }) => { if (vivo) { setPerfil(data as Perfil | null); setCargando(false) } })
    return () => { vivo = false }
  }, [sesion])

  const valor: EstadoSesion = {
    cargando, sesion, perfil,
    esAdmin: perfil?.rol === 'admin' && perfil.activo,
    creandoClave,
    terminarClave: () => setCreandoClave(false),
    salir: async () => { await supabase.auth.signOut() },
  }
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSesion fuera de ProveedorSesion')
  return c
}
