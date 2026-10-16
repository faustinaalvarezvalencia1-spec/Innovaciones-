import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'brand/logo-rosado.png'],
      manifest: {
        name: 'Innovaciones · Administración',
        short_name: 'Innovaciones',
        description: 'Caja, gastos e inventario de Almacén Innovaciones',
        lang: 'es-CO',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fffeed',
        theme_color: '#c7304a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo la app se guarda en caché; los datos siempre vienen de Supabase.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
})
