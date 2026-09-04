import { describe, expect, it } from 'vitest'
import { parseDriveDeepLink } from './deepLink'

describe('parseDriveDeepLink', () => {
  it('reads Drive "Open with" state', () => {
    const state = encodeURIComponent(
      JSON.stringify({ ids: ['abc123'], action: 'open', userId: '1' }),
    )
    expect(parseDriveDeepLink(`?state=${state}`)).toBe('abc123')
  })
  it('ignores create actions and malformed state', () => {
    const state = encodeURIComponent(JSON.stringify({ ids: ['abc'], action: 'create' }))
    expect(parseDriveDeepLink(`?state=${state}`)).toBeNull()
    expect(parseDriveDeepLink('?state=%7Bnot-json')).toBeNull()
    expect(parseDriveDeepLink('')).toBeNull()
  })
  it('accepts a plain driveId', () => {
    expect(parseDriveDeepLink('?driveId=zzz&other=1')).toBe('zzz')
  })
})
