import type { ModelInfo, Usage } from './openrouter'

export function formatContext(n: number | null): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M ctx`
  return `${Math.round(n / 1000)}k ctx`
}

export function formatPrice(m: ModelInfo): string {
  if (m.promptPrice === null && m.completionPrice === null) return ''
  if ((m.promptPrice ?? 0) === 0 && (m.completionPrice ?? 0) === 0) return 'free'
  const f = (v: number | null) => (v === null ? '?' : v < 0.01 ? '<$0.01' : `$${v.toFixed(2)}`)
  return `${f(m.promptPrice)} / ${f(m.completionPrice)} per 1M`
}

export function formatUsage(u: Usage | null | undefined): string {
  if (!u) return ''
  const parts = [
    `${u.promptTokens.toLocaleString()} in`,
    `${u.completionTokens.toLocaleString()} out`,
  ]
  if (u.cost !== null) parts.push(u.cost < 0.0001 ? '<$0.0001' : `$${u.cost.toFixed(4)}`)
  return parts.join(' · ')
}
