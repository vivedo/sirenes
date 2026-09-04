/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_API_KEY?: string
  readonly VITE_GOOGLE_APP_ID?: string
  readonly VITE_APP_URL?: string
  readonly VITE_COLLAB_TRANSPORT?: 'fake' | 'peer'
  readonly VITE_PEER_HOST?: string
  readonly VITE_PEER_PORT?: string
  readonly VITE_PEER_PATH?: string
  readonly VITE_PEER_SECURE?: string
  readonly VITE_PEER_ICE?: string
}

declare const __MERMAID_VERSION__: string
