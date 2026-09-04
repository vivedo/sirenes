export const DRIVE_API = 'https://www.googleapis.com/drive/v3'
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFileMeta {
  id: string
  name: string
  mimeType: string
  modifiedTime: string | null
}

export class DriveApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'DriveApiError'
    this.status = status
  }
}

async function check(res: Response): Promise<Response> {
  if (res.ok) return res
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    detail = body.error?.message ?? ''
  } catch {
    /* no body */
  }
  const friendly: Record<number, string> = {
    401: 'Google sign-in expired.',
    403: 'Google Drive denied access to this file.',
    404: 'File not found on Google Drive.',
    429: 'Google Drive rate limit reached. Try again shortly.',
  }
  const base = friendly[res.status] ?? `Google Drive request failed (${res.status}).`
  throw new DriveApiError(detail ? `${base} ${detail}` : base, res.status)
}

const META_FIELDS = 'id,name,mimeType,modifiedTime'

function toMeta(raw: {
  id: string
  name: string
  mimeType?: string
  modifiedTime?: string
}): DriveFileMeta {
  return {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType ?? 'text/plain',
    modifiedTime: raw.modifiedTime ?? null,
  }
}

export async function getFileMeta(
  id: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DriveFileMeta> {
  const res = await check(
    await fetchImpl(
      `${DRIVE_API}/files/${encodeURIComponent(id)}?fields=${META_FIELDS}&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    ),
  )
  return toMeta(await res.json())
}

export async function downloadFile(
  id: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await check(
    await fetchImpl(
      `${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    ),
  )
  return res.text()
}

function mimeFor(name: string): string {
  return /\.(md|markdown)$/i.test(name) ? 'text/markdown' : 'text/plain'
}

/** Create a new file with a multipart upload (metadata + content in one request). */
export async function createFile(
  name: string,
  content: string,
  token: string,
  folderId: string | null = null,
  fetchImpl: typeof fetch = fetch,
): Promise<DriveFileMeta> {
  const boundary = 'sirenes-' + Math.random().toString(36).slice(2)
  const metadata = JSON.stringify({
    name,
    mimeType: mimeFor(name),
    ...(folderId ? { parents: [folderId] } : {}),
  })
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeFor(name)}; charset=UTF-8\r\n\r\n${content}\r\n` +
    `--${boundary}--`
  const res = await check(
    await fetchImpl(
      `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=${META_FIELDS}&supportsAllDrives=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    ),
  )
  return toMeta(await res.json())
}

/** Replace the content of an existing file. */
export async function updateFile(
  id: string,
  content: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DriveFileMeta> {
  const res = await check(
    await fetchImpl(
      `${DRIVE_UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${META_FIELDS}&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain; charset=UTF-8' },
        body: content,
      },
    ),
  )
  return toMeta(await res.json())
}
