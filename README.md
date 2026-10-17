# Almacén Innovaciones · Administración

App web instalable (PWA) para registrar caja, gastos e inventario de Almacén Innovaciones.

- **App publicada:** https://contabilidad-innovaciones.netlify.app (Netlify publica solo cada cambio en `main`).
- **Base de datos:** Supabase, proyecto "Contabilidad Innovaciones" (organización Almacen innovaciones).
- `supabase/migrations/`: esquema, seguridad (RLS) y bloqueos de borrado/edición.
- `src/`: React + Vite + TypeScript.

## Desarrollo local
1. Copia `.env.example` como `.env` y pon la URL y la llave publicable de Supabase.
2. `npm install` y `npm run dev` → http://localhost:5173

## Variables en Netlify
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (llave publicable). Nunca la llave service_role.
