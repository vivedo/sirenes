import { getDriveConfig } from './config'
import { GAPI_SRC, loadScript } from './scripts'

let pickerReady: Promise<void> | null = null

async function ensurePicker(): Promise<void> {
  if (pickerReady) return pickerReady
  pickerReady = loadScript(GAPI_SRC).then(
    () => new Promise<void>((resolve) => gapi.load('picker', resolve)),
  )
  return pickerReady
}

const MIME_TYPES =
  'text/plain,text/markdown,text/x-markdown,application/octet-stream,application/x-mermaid'

/** Show the Google Picker limited to diagram-like files. Resolves null on cancel. */
export async function pickDriveFile(token: string): Promise<{ id: string; name: string } | null> {
  const config = getDriveConfig()
  if (!config) throw new Error('Google Drive is not configured for this deployment.')
  await ensurePicker()
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setMimeTypes(MIME_TYPES)
      .setIncludeFolders(true)
      .setMode(google.picker.DocsViewMode.LIST)
    let builder = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setTitle('Open a Mermaid diagram')
      .setOrigin(location.origin)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs?.[0]
          picker.dispose()
          resolve(doc ? { id: doc.id, name: doc.name } : null)
        } else if (data.action === google.picker.Action.CANCEL) {
          picker.dispose()
          resolve(null)
        }
      })
    if (config.appId) builder = builder.setAppId(config.appId)
    const picker = builder.build()
    picker.setVisible(true)
  })
}
