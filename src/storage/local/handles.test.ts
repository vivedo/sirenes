import { describe, expect, it, vi } from 'vitest'
import { ensurePermission, forgetHandle, loadHandle, storeHandle } from './handles'

function fakeHandle(perm: PermissionState, afterRequest: PermissionState = perm) {
  return {
    kind: 'file',
    name: 'x.mmd',
    queryPermission: vi.fn(async () => perm),
    requestPermission: vi.fn(async () => afterRequest),
  } as unknown as FileSystemFileHandle
}

describe('handles', () => {
  it('stores and loads handles by key, and forgets them', async () => {
    const h = fakeHandle('granted')
    const key = await storeHandle(h)
    expect(await loadHandle(key)).toBe(h)
    await forgetHandle(key)
    expect(await loadHandle(key)).toBeNull()
  })

  it('only prompts when permission is not already granted', async () => {
    const granted = fakeHandle('granted')
    expect(await ensurePermission(granted, 'readwrite')).toBe(true)
    expect(
      (granted as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission,
    ).not.toHaveBeenCalled()

    const prompt = fakeHandle('prompt', 'granted')
    expect(await ensurePermission(prompt, 'readwrite')).toBe(true)
    expect(
      (prompt as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission,
    ).toHaveBeenCalledWith({ mode: 'readwrite' })

    const denied = fakeHandle('prompt', 'denied')
    expect(await ensurePermission(denied, 'read')).toBe(false)
  })

  it('treats handles without permission methods as granted', async () => {
    expect(
      await ensurePermission(
        { kind: 'file', name: 'x' } as unknown as FileSystemFileHandle,
        'read',
      ),
    ).toBe(true)
  })
})
