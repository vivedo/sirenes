import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_MODEL_ID, useAiStore } from './aiStore'
import { useAiSettingsStore } from './aiSettingsStore'
import { formatContext, formatPrice } from './format'
import { Icon } from '../shared/Icon'
import type { ModelInfo } from './openrouter'

export function ModelSelector() {
  const models = useAiStore((s) => s.models)
  const status = useAiStore((s) => s.modelsStatus)
  const error = useAiStore((s) => s.modelsError)
  const ensureModels = useAiStore((s) => s.ensureModels)
  const selectedId = useAiSettingsStore((s) => s.selectedModelId) ?? DEFAULT_MODEL_ID
  const setSelected = useAiSettingsStore((s) => s.setSelectedModel)
  const favourites = useAiSettingsStore((s) => s.favourites)
  const toggleFavourite = useAiSettingsStore((s) => s.toggleFavourite)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    void ensureModels()
    search.current?.focus()
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ensureModels])

  const selected = models.find((m) => m.id === selectedId)
  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      q
        ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
        : models,
    [models, q],
  )
  const favs = filtered.filter((m) => favourites.includes(m.id))
  const rest = filtered.filter((m) => !favourites.includes(m.id)).slice(0, 200)

  const pick = (id: string) => {
    setSelected(id)
    setOpen(false)
    setQuery('')
  }

  const row = (m: ModelInfo) => (
    <li
      key={m.id}
      role="option"
      aria-selected={m.id === selectedId}
      className={m.id === selectedId ? 'selected' : ''}
    >
      <button className="model-row" onClick={() => pick(m.id)} data-testid={`model-${m.id}`}>
        <span className="model-name">{m.name}</span>
        <span className="model-meta">
          {formatContext(m.contextLength)}
          {formatContext(m.contextLength) && formatPrice(m) ? ' · ' : ''}
          {formatPrice(m)}
        </span>
      </button>
      <button
        className={`model-star${favourites.includes(m.id) ? ' on' : ''}`}
        onClick={() => toggleFavourite(m.id)}
        aria-label={favourites.includes(m.id) ? 'Remove favourite' : 'Add favourite'}
        aria-pressed={favourites.includes(m.id)}
      >
        ★
      </button>
    </li>
  )

  return (
    <div className="model-selector" ref={root}>
      <button
        className="outline model-button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="model-button"
        title={selectedId}
      >
        <span className="model-button-label">{selected?.name ?? selectedId}</span>
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="model-popover">
          <input
            ref={search}
            className="model-search"
            placeholder="Search models…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="model-search"
          />
          {status === 'loading' && <div className="ai-muted model-status">Loading models…</div>}
          {status === 'error' && <div className="ai-error model-status">{error}</div>}
          <ul role="listbox" className="model-list">
            {!q && (
              <li
                role="option"
                aria-selected={selectedId === DEFAULT_MODEL_ID}
                className={selectedId === DEFAULT_MODEL_ID ? 'selected' : ''}
              >
                <button className="model-row" onClick={() => pick(DEFAULT_MODEL_ID)}>
                  <span className="model-name">Auto (OpenRouter picks)</span>
                  <span className="model-meta">{DEFAULT_MODEL_ID}</span>
                </button>
              </li>
            )}
            {favs.length > 0 && <li className="model-group">Favourites</li>}
            {favs.map(row)}
            {favs.length > 0 && rest.length > 0 && <li className="model-group">All models</li>}
            {rest.map(row)}
            {status === 'ready' && filtered.length === 0 && (
              <li className="ai-muted model-status">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
