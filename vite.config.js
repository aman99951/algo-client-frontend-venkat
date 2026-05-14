import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'TradeVault Signals',
        short_name: 'TVSignals',
        description: 'Real-time trading signals for NIFTY & BANKNIFTY options',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Force immediate activation of new service worker
        skipWaiting: true,
        clientsClaim: true,
        // Don't cache API calls in service worker
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
})
