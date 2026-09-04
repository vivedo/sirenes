import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth', () => ({ getAccessToken: vi.fn(async () => 'tok'), invalidateToken: vi.fn() }))
vi.mock('./picker', () => ({ pickDriveFile: vi.fn() }))
vi.mock('./api', async (orig) => {
  const mod = await orig<typeof import('./api')>()
  return {
    ...mod,
    getFileMeta: vi.fn(),
    downloadFile: vi.fn(),
    updateFile: vi.fn(),
    createFile: vi.fn(),
  }
})

import { DriveApiError, createFile, downloadFile, getFileMeta, updateFile } from './api'
import { getAccessToken, invalidateToken } from './auth'
import { pickDriveFile } from './picker'
import { driveProvider } from './driveProvider'

const meta = (modifiedTime: string) => ({
  id: 'f1',
  name: 'a.mmd',
  mimeType: 'text/plain',
  modifiedTime,
})

describe('driveProvider', () => {
  beforeEach(() => {
    vi.mocked(getFileMeta).mockReset().mockResolvedValue(meta('T1'))
    vi.mocked(downloadFile).mockReset().mockResolvedValue('graph TD')
    vi.mocked(updateFile).mockReset().mockResolvedValue(meta('T2'))
    vi.mocked(createFile)
      .mockReset()
      .mockResolvedValue({ ...meta('T9'), id: 'new' })
    vi.mocked(getAccessToken).mockClear()
    vi.mocked(invalidateToken).mockClear()
  })

  it('open picks a file and returns content with a Drive origin', async () => {
    vi.mocked(pickDriveFile).mockResolvedValue({ id: 'f1', name: 'a.mmd' })
    const opened = await driveProvider.open()
    expect(opened).toEqual({
      name: 'a.mmd',
      content: 'graph TD',
      origin: { kind: 'drive', fileId: 'f1', modifiedTime: 'T1' },
    })
  })

  it('open returns null when the picker is cancelled', async () => {
    vi.mocked(pickDriveFile).mockResolvedValue(null)
    expect(await driveProvider.open()).toBeNull()
  })

  it('save updates and records the new modifiedTime', async () => {
    const r = await driveProvider.save(
      { kind: 'drive', fileId: 'f1', modifiedTime: 'T1' },
      'x',
      'a.mmd',
    )
    expect(r.origin).toEqual({ kind: 'drive', fileId: 'f1', modifiedTime: 'T2' })
    expect(updateFile).toHaveBeenCalledWith('f1', 'x', 'tok')
  })

  it('retries once with a fresh token after a 401', async () => {
    vi.mocked(updateFile).mockRejectedValueOnce(new DriveApiError('expired', 401))
    await driveProvider.save({ kind: 'drive', fileId: 'f1', modifiedTime: 'T1' }, 'x', 'a.mmd')
    expect(invalidateToken).toHaveBeenCalledTimes(1)
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    expect(updateFile).toHaveBeenCalledTimes(2)
  })

  it('checkConflict reports a newer remote copy and nothing otherwise', async () => {
    expect(
      await driveProvider.checkConflict!({ kind: 'drive', fileId: 'f1', modifiedTime: 'T1' }),
    ).toBeNull()
    vi.mocked(getFileMeta).mockResolvedValue(meta('T5'))
    const c = await driveProvider.checkConflict!({
      kind: 'drive',
      fileId: 'f1',
      modifiedTime: 'T1',
    })
    expect(c?.remoteModifiedTime).toBe('T5')
    expect(await driveProvider.checkConflict!({ kind: 'local', handleKey: null })).toBeNull()
  })

  it('saveAs creates the file in the chosen folder', async () => {
    const r = await driveProvider.saveAs('content', { name: 'fresh.mmd', folderId: 'folder-9' })
    expect(createFile).toHaveBeenCalledWith('fresh.mmd', 'content', 'tok', 'folder-9')
    expect(r?.origin).toEqual({ kind: 'drive', fileId: 'new', modifiedTime: 'T9' })
    await driveProvider.saveAs('c', { name: 'root.mmd' })
    expect(createFile).toHaveBeenLastCalledWith('root.mmd', 'c', 'tok', null)
  })
})
