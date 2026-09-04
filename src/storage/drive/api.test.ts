import { describe, expect, it, vi } from 'vitest'
import { DriveApiError, createFile, downloadFile, getFileMeta, updateFile } from './api'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('drive api', () => {
  it('reads metadata and content with the bearer token', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('alt=media')
        ? new Response('graph TD')
        : json({ id: 'f1', name: 'a.mmd', modifiedTime: 'T1' }),
    ) as unknown as typeof fetch
    expect(await getFileMeta('f1', 'tok', fetchImpl)).toEqual({
      id: 'f1',
      name: 'a.mmd',
      mimeType: 'text/plain',
      modifiedTime: 'T1',
    })
    expect(await downloadFile('f1', 'tok', fetchImpl)).toBe('graph TD')
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('creates files with a multipart body carrying metadata and content', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, init }
      return json({ id: 'new', name: 'notes.md', mimeType: 'text/markdown', modifiedTime: 'T2' })
    }) as unknown as typeof fetch
    const meta = await createFile('notes.md', '# hi', 'tok', fetchImpl)
    expect(meta.id).toBe('new')
    const { url, init } = captured!
    expect(url).toContain('/upload/drive/v3/files?uploadType=multipart')
    expect(init.method).toBe('POST')
    const ct = (init.headers as Record<string, string>)['Content-Type']
    expect(ct).toMatch(/^multipart\/related; boundary=/)
    const body = init.body as string
    expect(body).toContain('"name":"notes.md"')
    expect(body).toContain('"mimeType":"text/markdown"')
    expect(body).toContain('\r\n\r\n# hi\r\n')
  })

  it('updates in place with a media PATCH', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, init }
      return json({ id: 'f1', name: 'a.mmd', modifiedTime: 'T3' })
    }) as unknown as typeof fetch
    const meta = await updateFile('f1', 'graph LR', 'tok', fetchImpl)
    expect(meta.modifiedTime).toBe('T3')
    expect(captured!.url).toContain('/upload/drive/v3/files/f1?uploadType=media')
    expect(captured!.init.method).toBe('PATCH')
    expect(captured!.init.body).toBe('graph LR')
  })

  it('maps errors to friendly messages with the status', async () => {
    const fetchImpl = (async () =>
      json({ error: { message: 'gone' } }, 404)) as unknown as typeof fetch
    await expect(getFileMeta('x', 'tok', fetchImpl)).rejects.toMatchObject({
      status: 404,
      message: /not found.*gone/i,
    })
    await expect(getFileMeta('x', 'tok', fetchImpl)).rejects.toBeInstanceOf(DriveApiError)
  })
})
