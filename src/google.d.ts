/** Minimal typings for Google Identity Services and the Google Picker, loaded at runtime. */
declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string
    expires_in: number
    scope: string
    token_type: string
    error?: string
    error_description?: string
  }
  interface TokenClientConfig {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type: string; message?: string }) => void
    prompt?: '' | 'none' | 'consent' | 'select_account'
  }
  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: '' | 'none' | 'consent' | 'select_account' }): void
  }
  function initTokenClient(config: TokenClientConfig): TokenClient
  function revoke(accessToken: string, done?: () => void): void
}

declare namespace google.picker {
  const Action: { PICKED: string; CANCEL: string }
  const ViewId: { DOCS: string }
  const Feature: { NAV_HIDDEN: string; MINE_ONLY: string }
  interface Document {
    id: string
    name: string
    mimeType?: string
  }
  interface ResponseObject {
    action: string
    docs?: Document[]
  }
  class DocsView {
    constructor(viewId?: string)
    setMimeTypes(mimeTypes: string): DocsView
    setIncludeFolders(include: boolean): DocsView
    setSelectFolderEnabled(enabled: boolean): DocsView
    setMode(mode: string): DocsView
  }
  const DocsViewMode: { LIST: string; GRID: string }
  class PickerBuilder {
    addView(view: DocsView): PickerBuilder
    setOAuthToken(token: string): PickerBuilder
    setDeveloperKey(key: string): PickerBuilder
    setAppId(appId: string): PickerBuilder
    setCallback(cb: (data: ResponseObject) => void): PickerBuilder
    setTitle(title: string): PickerBuilder
    enableFeature(feature: string): PickerBuilder
    setOrigin(origin: string): PickerBuilder
    build(): Picker
  }
  interface Picker {
    setVisible(visible: boolean): void
    dispose(): void
  }
}

declare const gapi: {
  load(api: string, callback: () => void): void
}
