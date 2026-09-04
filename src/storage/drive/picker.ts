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

export interface PickedItem {
  id: string
  name: string
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

async function showPicker(
  token: string,
  makeView: () => google.picker.DocsView,
  title: string,
): Promise<PickedItem | null> {
  const config = getDriveConfig()
  if (!config) throw new Error('Google Drive is not configured for this deployment.')
  await ensurePicker()
  return new Promise((resolve) => {
    let builder = new google.picker.PickerBuilder()
      .addView(makeView())
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setTitle(title)
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

/** Show the Google Picker limited to diagram-like files. Resolves null on cancel. */
export function pickDriveFile(token: string): Promise<PickedItem | null> {
  return showPicker(
    token,
    () =>
      new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMimeTypes(MIME_TYPES)
        .setIncludeFolders(true)
        .setMode(google.picker.DocsViewMode.LIST),
    'Open a Mermaid diagram',
  )
}

/** Show the Google Picker in folder mode. Resolves null on cancel. */
export function pickDriveFolder(token: string): Promise<PickedItem | null> {
  return showPicker(
    token,
    () =>
      new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setMimeTypes(FOLDER_MIME)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMode(google.picker.DocsViewMode.LIST),
    'Choose a folder',
  )
}
