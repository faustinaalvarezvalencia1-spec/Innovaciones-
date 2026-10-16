import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example).')
}

export const supabase = createClient(url, key, {
  // implicit: el enlace del correo funciona aunque se abra en otro navegador (Safari vs. app instalada).
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
})

export const NOTION_URL = 'https://app.notion.com/p/3fb8bbaba3198178b324ee6b945e4f80'
