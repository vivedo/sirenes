import { useDocumentStore, selectIsDirty } from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { MERMAID_THEMES, type Layout, type MermaidTheme } from '../store/types'
import { TEMPLATES } from '../documents/templates'
import { Menu, MenuItem, MenuSeparator } from './Menu'
import { Icon } from '../shared/Icon'
import { downloadPng, downloadSvg, standaloneSvg } from '../preview/exportDiagram'
import { copyText, downloadBlob } from '../shared/download'
import { toast } from '../store/toastStore'
import { copyShareLink } from '../share/shareLinks'
import { modKey } from '../shared/platform'
import { resolveUiTheme } from '../settings/uiTheme'
import { documentBaseName } from '../documents/naming'

export function Toolbar({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const doc = useDocumentStore((s) => s.doc)
  const svg = useDocumentStore((s) => s.render.svg)
  const dirty = useDocumentStore(selectIsDirty)
  const newDocument = useDocumentStore((s) => s.newDocument)
  const setMermaidTheme = useDocumentStore((s) => s.setMermaidTheme)
  const urlStatus = useDocumentStore((s) => s.urlStatus)

  const layout = useSettingsStore((s) => s.layout)
  const setLayout = useSettingsStore((s) => s.setLayout)
  const uiTheme = useSettingsStore((s) => s.uiTheme)
  const setUiTheme = useSettingsStore((s) => s.setUiTheme)
  const aiPanelOpen = useSettingsStore((s) => s.aiPanelOpen)
  const toggleAiPanel = useSettingsStore((s) => s.toggleAiPanel)

  const baseName = documentBaseName(doc.fileName)
  const resolvedTheme = resolveUiTheme(uiTheme)

  const startNew = (source?: string) => {
    if (dirty && !window.confirm('Discard the current diagram and start a new one?')) return
    newDocument({ source })
  }

  const exportSvg = () => svg && downloadSvg(svg, baseName)
  const exportPng = async (scale: number) => {
    if (!svg) return
    try {
      const bg = resolvedTheme === 'dark' && doc.mermaidTheme === 'dark' ? '#16161a' : '#ffffff'
      await downloadPng(svg, baseName, scale, bg)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PNG export failed')
    }
  }
  const copySvg = async () =>
    svg && toast.info((await copyText(standaloneSvg(svg))) ? 'SVG copied' : 'Clipboard unavailable')
  const copySource = async () =>
    toast.info((await copyText(doc.source)) ? 'Source copied' : 'Clipboard unavailable')
  const downloadSource = () =>
    downloadBlob(new Blob([doc.source], { type: 'text/plain;charset=utf-8' }), `${baseName}.mmd`)

  return (
    <header className="toolbar" role="banner">
      <div className="brand" title="Sirenes — live Mermaid diagrams">
        <span className="brand-mark" aria-hidden="true">
          ~
        </span>
        Sirenes
      </div>

      <Menu label="New" icon="file" testId="menu-new">
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                startNew('')
                close()
              }}
              hint={`${modKey} N`}
            >
              Blank
            </MenuItem>
            <MenuSeparator />
            {TEMPLATES.map((t) => (
              <MenuItem
                key={t.id}
                onClick={() => {
                  startNew(t.source)
                  close()
                }}
                testId={`template-${t.id}`}
              >
                {t.name}
              </MenuItem>
            ))}
          </>
        )}
      </Menu>

      <Menu label="Export" icon="download" testId="menu-export">
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                exportSvg()
                close()
              }}
              disabled={!svg}
            >
              Download SVG
            </MenuItem>
            <MenuItem
              onClick={() => {
                void exportPng(1)
                close()
              }}
              disabled={!svg}
            >
              Download PNG
            </MenuItem>
            <MenuItem
              onClick={() => {
                void exportPng(2)
                close()
              }}
              disabled={!svg}
            >
              Download PNG @2x
            </MenuItem>
            <MenuItem
              onClick={() => {
                void exportPng(4)
                close()
              }}
              disabled={!svg}
            >
              Download PNG @4x
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                void copySvg()
                close()
              }}
              disabled={!svg}
            >
              Copy SVG
            </MenuItem>
            <MenuItem
              onClick={() => {
                void copySource()
                close()
              }}
            >
              Copy source
            </MenuItem>
            <MenuItem
              onClick={() => {
                downloadSource()
                close()
              }}
              hint={`${modKey} S`}
            >
              Download .mmd
            </MenuItem>
          </>
        )}
      </Menu>

      <Menu label="Share" icon="link" testId="menu-share">
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                void copyShareLink(false)
                close()
              }}
              disabled={urlStatus === 'too-long'}
              testId="copy-share-link"
            >
              Copy share link
            </MenuItem>
            <MenuItem
              onClick={() => {
                void copyShareLink(true)
                close()
              }}
              disabled={urlStatus === 'too-long'}
              testId="copy-view-link"
            >
              Copy view-only link
            </MenuItem>
            {urlStatus !== 'ok' && (
              <>
                <MenuSeparator />
                <li className="menu-note" role="note">
                  {urlStatus === 'long' &&
                    'This diagram makes a long link. Some apps truncate long URLs.'}
                  {urlStatus === 'too-long' && 'Too large for a link. Save to a file instead.'}
                  {urlStatus === 'unsupported' &&
                    'Compression unavailable; link uses plain base64.'}
                </li>
              </>
            )}
          </>
        )}
      </Menu>

      <label className="toolbar-field">
        <span className="visually-hidden">Mermaid theme</span>
        <select
          value={doc.mermaidTheme}
          onChange={(e) => setMermaidTheme(e.target.value as MermaidTheme)}
          title="Mermaid theme"
          data-testid="mermaid-theme"
        >
          {MERMAID_THEMES.map((t) => (
            <option key={t} value={t}>
              Theme: {t}
            </option>
          ))}
        </select>
      </label>

      <div className="segmented" role="radiogroup" aria-label="Layout">
        {(
          [
            ['editor', 'code', 'Editor only'],
            ['split', 'columns', 'Split'],
            ['preview', 'eye', 'Preview only'],
          ] as const
        ).map(([value, icon, label]) => (
          <button
            key={value}
            role="radio"
            aria-checked={layout === value}
            aria-label={label}
            title={label}
            className={layout === value ? 'active' : ''}
            onClick={() => setLayout(value as Layout)}
            data-testid={`layout-${value}`}
          >
            <Icon name={icon} />
          </button>
        ))}
      </div>

      <div className="toolbar-title" aria-live="polite">
        {doc.fileName ?? 'Untitled'}
        {dirty && <span title="Unsaved changes"> •</span>}
      </div>

      <div className="toolbar-spacer" />

      <button
        onClick={() => setUiTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
        aria-label="Toggle colour theme"
        data-testid="toggle-ui-theme"
      >
        <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <button
        onClick={() => toggleAiPanel()}
        aria-pressed={aiPanelOpen}
        title={`AI assistant (${modKey} ⇧ A)`}
        className={aiPanelOpen ? 'active' : ''}
        data-testid="toggle-ai"
      >
        <Icon name="sparkle" />
        AI
      </button>
      <button
        onClick={onShowShortcuts}
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
      >
        <Icon name="help" />
      </button>
    </header>
  )
}
