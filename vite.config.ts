/// <reference types="vitest/config" />
import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const require = createRequire(import.meta.url)
const mermaidVersion: string = require('mermaid/package.json').version

/** The PeerJS signalling server (WebSocket + HTTP id endpoint). Default: the public PeerJS cloud. */
function peerConnectSrc(): string {
  const host = process.env.VITE_PEER_HOST ?? '0.peerjs.com'
  const port = process.env.VITE_PEER_PORT ? `:${process.env.VITE_PEER_PORT}` : ''
  return `wss://${host}${port} https://${host}${port}`
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://apis.google.com",
  // Mermaid and CodeMirror inject inline styles; there is no way around 'unsafe-inline' for styles.
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' https://openrouter.ai https://www.googleapis.com https://accounts.google.com https://oauth2.googleapis.com ${peerConnectSrc()}`,
  'frame-src https://accounts.google.com https://docs.google.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

/** Injects the production CSP meta tag. Skipped in dev so Vite's HMR websocket keeps working. */
function cspPlugin(): Plugin {
  return {
    name: 'sirenes-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cspPlugin()],
  define: {
    __MERMAID_VERSION__: JSON.stringify(mermaidVersion),
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/@codemirror/') || id.includes('node_modules/@lezer/'))
            return 'codemirror'
          if (id.includes('node_modules/beautiful-mermaid/') || id.includes('node_modules/elkjs/'))
            return 'beautiful'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
