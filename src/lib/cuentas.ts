import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Cuenta } from './tipos'

/** Cuentas activas, en el orden en que se muestran (la caja primero). */
export function useCuentas() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  useEffect(() => {
    supabase.from('cuentas').select('*').eq('activo', true).order('orden')
      .then(({ data }) => setCuentas((data ?? []) as Cuenta[]))
  }, [])
  return cuentas
}

export const esCaja = (c: Cuenta | undefined) => c?.tipo === 'Efectivo'
export const esDatafono = (c: Cuenta | undefined) => c?.tipo === 'Datáfono'
