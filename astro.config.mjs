// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import preact from '@astrojs/preact';
import AstroPWA from '@vite-pwa/astro';

// GitHub Pages menyajikan repo ini dari subpath (bukan root domain / custom domain) -
// semua path absolut (manifest, ikon, navigateFallback) harus ikut diberi awalan ini secara eksplisit,
// karena @vite-pwa/astro tidak otomatis melakukannya untuk field-field ini.
const base = '/Point-of-Sales';

// https://astro.build/config
export default defineConfig({
  site: 'https://agungdwisahputra.github.io',
  base,
  vite: {
    plugins: [tailwindcss()],
    server: {
      // izinkan akses dev server lewat tunnel ngrok saat testing lintas device (host asli tidak dikenal Vite secara default)
      allowedHosts: ['.ngrok-free.app'],
    },
  },

  integrations: [
    preact(),
    AstroPWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registrasi manual lewat src/pwa.ts, lihat index.astro
      includeAssets: ['favicon.ico', 'icons/logo-persegi.webp', 'icons/logo-tittle.webp'],
      manifest: {
        name: 'Sahma.id — POS System',
        short_name: 'Sahma.id',
        description: 'Sistem POS offline-first untuk toko kecil',
        theme_color: '#1874dd',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: `${base}/`,
        scope: `${base}/`,
        icons: [
          { src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // cache-first untuk aset statis hasil build
        globPatterns: ['**/*.{js,css,html,svg,ico,png,webp,woff2}'],
        // Harus PERSIS sama dengan key precache index.html yang di-generate vite-plugin-pwa
        // (tanpa trailing slash), karena createHandlerBoundToURL butuh exact match di precache manifest -
        // bukan harus cocok dengan URL request masuk (NavigationRoute menangani semua navigasi dalam scope).
        navigateFallback: base,
        runtimeCaching: [
          {
            // stale-while-revalidate untuk GET ke REST API Supabase (F04)
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-api-get',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true, // supaya bisa diuji di `astro dev`, bukan cuma build produksi
      },
    }),
  ]
});