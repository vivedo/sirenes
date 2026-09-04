import { useDocumentStore } from '../store/documentStore'
import { toast } from '../store/toastStore'
import { copyText } from '../shared/download'
import { encodeState, shareStateOf } from './codec'
import { buildUrl, classifyUrlLength } from './urlState'

export async function buildShareLink(viewOnly: boolean): Promise<string> {
  const { doc } = useDocumentStore.getState()
  const fragment = await encodeState({
    ...shareStateOf(doc),
    ...(viewOnly ? { view: 'preview' as const } : {}),
  })
  return buildUrl(fragment)
}

export async function copyShareLink(viewOnly: boolean): Promise<void> {
  try {
    const url = await buildShareLink(viewOnly)
    const status = classifyUrlLength(url)
    if (status === 'too-long') {
      toast.error('This diagram is too large to fit in a link. Save it to a file instead.')
      return
    }
    const ok = await copyText(url)
    if (!ok) {
      toast.error('Clipboard unavailable. Copy the address bar instead.')
      return
    }
    if (status === 'long')
      toast.warn(
        `${viewOnly ? 'View-only link' : 'Link'} copied. It is long; some apps truncate long URLs.`,
      )
    else toast.info(viewOnly ? 'View-only link copied' : 'Share link copied')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not build link')
  }
}
