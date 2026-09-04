import { useDocumentStore } from '../../store/documentStore'
import { useSettingsStore } from '../../store/settingsStore'
import { getTheme, themesByEngine, type ThemeId } from '../../themes/registry'
import { isBeautifulSupported } from '../../preview/beautifulEngine'
import { downloadPng, downloadSvg } from '../../preview/exportDiagram'
import { copyText } from '../../shared/download'
import { toast } from '../../store/toastStore'
import { copyShareLink } from '../../share/shareLinks'
import { resolveUiTheme } from '../../settings/uiTheme'
import { exportBaseName } from '../../documents/naming'
import { startNewDiagram, startNewDocument } from '../../documents/actions'
import { useCollabStore, selectIsGuest } from '../../collab/collabStore'
import { Menu, MenuItem, MenuSeparator } from '../Menu'
import { FileMenu } from '../FileMenu'
import { LiveStrip } from '../../collab/LiveStrip'
import { Icon } from '../../shared/Icon'

/**
 * Phone toolbar. The desktop toolbar is untouched; this one folds its controls into two menus so
 * everything fits on one row.
 */
export function MobileToolbar({
  onShowShortcuts,
  onShowPrivacy,
}: {
  onShowShortcuts: () => void
  onShowPrivacy: () => void
}) {
  const doc = useDocumentStore((s) => s.doc)
  const svg = useDocumentStore((s) => s.render.svg)
  const setTheme = useDocumentStore((s) => s.setTheme)
  const fallback = useDocumentStore((s) => s.render.fallback)
  const urlStatus = useDocumentStore((s) => s.urlStatus)
  const uiTheme = useSettingsStore((s) => s.uiTheme)
  const setUiTheme = useSettingsStore((s) => s.setUiTheme)
  const isGuest = useCollabStore(selectIsGuest)
  const liveTitle = useCollabStore((s) => s.title)
  const hostName = useCollabStore((s) => s.hostName)
  const openLive = useCollabStore((s) => s.setPanelOpen)

  const resolvedTheme = resolveUiTheme(uiTheme)
  const beautifulOk = isBeautifulSupported(doc.source) || doc.source.trim() === ''
  const baseName = exportBaseName(
    doc.fileName,
    doc.diagrams.length > 1 ? doc.diagrams[doc.active]?.name : null,
  )

  const exportPng = async () => {
    if (!svg) return
    try {
      const theme = getTheme(doc.theme)
      await downloadPng(svg, baseName, 2, theme.dark && !fallback ? '#16161a' : '#ffffff')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PNG export failed')
    }
  }

  return (
    <header className="toolbar mobile-toolbar" role="banner" data-testid="mobile-toolbar">
      <img
        className="brand-mark"
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt="Sirenes"
        width="22"
        height="22"
      />

      {isGuest ? (
        <div className="mobile-title" data-testid="toolbar-title">
          {liveTitle}
          <span
            className="shared-badge"
            data-testid="shared-badge"
            title={`Shared by ${hostName ?? 'host'}`}
          >
            <Icon name="users" size={11} />
            <span className="mobile-badge-name">{hostName ?? 'host'}</span>
          </span>
        </div>
      ) : (
        <FileMenu />
      )}

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
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                openLive(true)
                close()
              }}
              testId="share-live"
            >
              <Icon name="users" /> Share live
            </MenuItem>
          </>
        )}
      </Menu>

      <div className="toolbar-spacer" />
      <LiveStrip />

      <Menu label="" icon="more" align="right" title="More" testId="mobile-more">
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                startNewDiagram()
                close()
              }}
              disabled={doc.markdown !== null}
              testId="new-diagram"
            >
              <Icon name="plus" /> New diagram in this file
            </MenuItem>
            <MenuItem
              onClick={() => {
                startNewDocument()
                close()
              }}
              testId="new-file"
            >
              <Icon name="file" /> New file (opens a new tab)
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                if (svg) downloadSvg(svg, baseName)
                close()
              }}
              disabled={!svg}
            >
              <Icon name="download" /> Download SVG
            </MenuItem>
            <MenuItem
              onClick={() => {
                void exportPng()
                close()
              }}
              disabled={!svg}
            >
              <Icon name="download" /> Download PNG @2x
            </MenuItem>
            <MenuItem
              onClick={() => {
                void copyText(doc.source).then((ok) =>
                  toast.info(ok ? 'Source copied' : 'Clipboard unavailable'),
                )
                close()
              }}
            >
              <Icon name="code" /> Copy source
            </MenuItem>
            <MenuSeparator />
            <li className="menu-field" role="none">
              <label>
                <span>Theme</span>
                <select
                  value={doc.theme}
                  onChange={(e) => setTheme(e.target.value as ThemeId)}
                  data-testid="mobile-theme"
                >
                  <optgroup label={beautifulOk ? 'Beautiful' : 'Beautiful (not for this diagram)'}>
                    {themesByEngine('beautiful').map((t) => (
                      <option key={t.id} value={t.id} disabled={!beautifulOk}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Mermaid classic">
                    {themesByEngine('mermaid').map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
            </li>
            <MenuItem
              onClick={() => {
                setUiTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
                close()
              }}
              testId="toggle-ui-theme"
            >
              <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} />{' '}
              {resolvedTheme === 'dark' ? 'Light interface' : 'Dark interface'}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                onShowPrivacy()
                close()
              }}
              testId="privacy-link"
            >
              Privacy
            </MenuItem>
            <MenuItem
              onClick={() => {
                onShowShortcuts()
                close()
              }}
            >
              Keyboard shortcuts
            </MenuItem>
          </>
        )}
      </Menu>
    </header>
  )
}
