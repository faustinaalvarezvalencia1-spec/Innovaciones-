import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/tipos'

interface EstadoSesion {
  cargando: boolean
  sesion: Session | null
  perfil: Perfil | null
  esAdmin: boolean
  salir: () => Promise<void>
}

const Contexto = createContext<EstadoSesion | null>(null)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
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
    salir: async () => { await supabase.auth.signOut() },
  }
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSesion fuera de ProveedorSesion')
  return c
}
