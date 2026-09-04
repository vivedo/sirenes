import { describe, expect, it } from 'vitest'
import {
  BEAUTIFUL_THEME_IDS,
  DEFAULT_THEME,
  THEMES,
  getTheme,
  isThemeId,
  themesByEngine,
} from './registry'
import { MERMAID_THEMES } from '../store/types'

describe('theme registry', () => {
  it('exposes every Mermaid theme and the chosen beautiful subset, with unique ids', () => {
    const ids = THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of MERMAID_THEMES) expect(ids).toContain(m)
    for (const b of BEAUTIFUL_THEME_IDS) expect(ids).toContain(b)
    expect(themesByEngine('beautiful')).toHaveLength(BEAUTIFUL_THEME_IDS.length)
  })

  it('maps beautiful themes to a dark or light Mermaid fallback', () => {
    expect(getTheme('tokyo-night').mermaidFallback).toBe('dark')
    expect(getTheme('zinc-light').mermaidFallback).toBe('default')
    expect(getTheme('forest').mermaidFallback).toBe('forest')
  })

  it('falls back to the default for unknown ids', () => {
    expect(getTheme('nope').id).toBe(DEFAULT_THEME)
    expect(getTheme(null).id).toBe(DEFAULT_THEME)
    expect(isThemeId('github-dark')).toBe(true)
    expect(isThemeId('solarized-dark')).toBe(false)
  })
})
