import type { MermaidTheme } from '../store/types'

export type Engine = 'mermaid' | 'beautiful'

/** Subset of beautiful-mermaid's built-in themes that Sirenes exposes. Add ids here to offer more. */
export const BEAUTIFUL_THEME_IDS = [
  'zinc-light',
  'github-light',
  'catppuccin-latte',
  'zinc-dark',
  'github-dark',
  'tokyo-night',
] as const
export type BeautifulThemeId = (typeof BEAUTIFUL_THEME_IDS)[number]

export type ThemeId = MermaidTheme | BeautifulThemeId

export interface ThemeDef {
  id: ThemeId
  label: string
  engine: Engine
  dark: boolean
  /** Theme to use when the diagram type is not supported by the beautiful engine, and for mermaid.live links. */
  mermaidFallback: MermaidTheme
}

const beautiful = (id: BeautifulThemeId, label: string, dark: boolean): ThemeDef => ({
  id,
  label,
  engine: 'beautiful',
  dark,
  mermaidFallback: dark ? 'dark' : 'default',
})
const classic = (id: MermaidTheme, label: string, dark: boolean): ThemeDef => ({
  id,
  label,
  engine: 'mermaid',
  dark,
  mermaidFallback: id,
})

export const THEMES: ThemeDef[] = [
  beautiful('zinc-light', 'Zinc light', false),
  beautiful('github-light', 'GitHub light', false),
  beautiful('catppuccin-latte', 'Catppuccin latte', false),
  beautiful('zinc-dark', 'Zinc dark', true),
  beautiful('github-dark', 'GitHub dark', true),
  beautiful('tokyo-night', 'Tokyo night', true),
  classic('default', 'Mermaid default', false),
  classic('neutral', 'Mermaid neutral', false),
  classic('forest', 'Mermaid forest', false),
  classic('base', 'Mermaid base', false),
  classic('dark', 'Mermaid dark', true),
]

export const DEFAULT_THEME: ThemeId = 'zinc-light'

const byId = new Map(THEMES.map((t) => [t.id, t]))

export function getTheme(id: string | null | undefined): ThemeDef {
  return (id && byId.get(id as ThemeId)) || byId.get(DEFAULT_THEME)!
}

export function isThemeId(id: unknown): id is ThemeId {
  return typeof id === 'string' && byId.has(id as ThemeId)
}

export function themesByEngine(engine: Engine): ThemeDef[] {
  return THEMES.filter((t) => t.engine === engine)
}
