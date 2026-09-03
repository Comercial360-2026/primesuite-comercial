import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  resolve: {
    // Espejo del alias @/ definido en tsconfig.json (paths). TypeScript y
    // Vite resuelven alias de forma independiente — configurarlo solo en
    // tsconfig no basta para que el bundler encuentre los módulos en
    // desarrollo ni en build.
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Solo se cachea el shell de la app (HTML/JS/CSS). Los datos de negocio
      // viven en la cola de IndexedDB (src/lib/offline-queue), nunca en el
      // cache del Service Worker — ver 09_arquitectura_tecnica.md §4.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Teselas de OpenStreetMap para el mapa de fotos: se cachean al
        // verlas (CacheFirst), así una zona ya visitada se ve sin cobertura.
        // Una zona nueva sin red sigue saliendo en blanco — asumido.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'PrimeNotes',
        short_name: 'PrimeNotes',
        description: 'App comercial de venta consultiva — Primion',
        lang: 'es',
        theme_color: '#1A3654',
        background_color: '#F4F5F7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
