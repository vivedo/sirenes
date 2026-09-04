import { beforeEach, describe, expect, it } from 'vitest'
import { addRecent, clearRecent, readRecent, removeRecent } from './recent'

describe('recent files', () => {
  beforeEach(() => clearRecent())

  it('adds to the front, dedupes, and caps at 10', async () => {
    for (let i = 0; i < 12; i++) await addRecent({ kind: 'local', id: `h${i}`, name: `f${i}.mmd` })
    let list = await readRecent()
    expect(list).toHaveLength(10)
    expect(list[0].id).toBe('h11')
    list = await addRecent({ kind: 'local', id: 'h5', name: 'renamed.mmd' })
    expect(list[0]).toMatchObject({ id: 'h5', name: 'renamed.mmd' })
    expect(list.filter((e) => e.id === 'h5')).toHaveLength(1)
  })

  it('removes entries', async () => {
    await addRecent({ kind: 'local', id: 'a', name: 'a' })
    await addRecent({ kind: 'drive', id: 'a', name: 'drive a' })
    const list = await removeRecent('local', 'a')
    expect(list).toEqual([expect.objectContaining({ kind: 'drive', id: 'a' })])
  })
})
