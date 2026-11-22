import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/relevamiento-pj/', // nombre del repo en GitHub Pages
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Relevamiento Territorial', short_name: 'Relevamiento',
        start_url: '.', display: 'standalone', theme_color: '#0b5fa5', background_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        runtimeCaching: [{
          urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/,
          handler: 'CacheFirst',
          options: { cacheName: 'tiles', expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 } }
        }]
      }
    })
  ]
})
