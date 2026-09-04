# Sirenes — Project Tasks

Ordered backlog derived from [PRD.md](./PRD.md). Phases run in priority order. Requirement ids in brackets point at the PRD tables. Each task has a done-when line so it can be checked off without ambiguity.

Priority order: UI → URL state → AI → local files → Google Drive → polish.

**Status (2026-09-04):** Phases 0 to 6 implemented; v1.0.0 tagged. Phase 7 (live collaboration) implemented and tested with the fake transport; the real PeerJS path is a manual check. Drive and OpenRouter are verified against stubbed services only; live checks with real credentials are still to do. Not done: service worker for offline asset caching (6.4, optional), Web Worker rendering (1.12, stretch).

---

## Phase 0 — Foundation

- [x] **0.1 Scaffold the app.** Vite + React 19 + TypeScript (strict). `npm create vite@latest` with the `react-ts` template, then remove boilerplate.
      Done when: `npm run dev` serves a blank page titled "Sirenes".
- [x] **0.2 Tooling.** oxlint (Vite 8 default, replaces ESLint), Prettier, Vitest + React Testing Library, Playwright config. `npm run lint`, `test`, `test:e2e` scripts.
      Done when: all three scripts run green on the empty project.
- [x] **0.3 CI.** GitHub Actions workflow running lint, unit tests, and build on push and PR. `npm audit --audit-level=high` step.
      Done when: a PR shows a green check.
- [x] **0.4 Static deploy.** GitHub Pages (or Cloudflare Pages) deploy on `main`. SPA fallback so deep links and fragments resolve.
      Done when: the empty shell is reachable at a public URL.
- [x] **0.5 CSP and headers.** `<meta http-equiv="Content-Security-Policy">` allowing `self`, Google GSI/Picker origins, and `connect-src` to Google APIs + `openrouter.ai`. No `unsafe-eval`.
      Done when: the app loads with no CSP console errors.
- [x] **0.6 State store.** Zustand store with slices: `document`, `settings`, `ui`. Typed selectors.
      Done when: a unit test can set and read source through the store.
- [x] **0.7 Theming.** Light/dark tokens as CSS variables, `prefers-color-scheme` default, manual override persisted in `localStorage`.
      Done when: toggling the theme updates the whole shell and survives reload.

## Phase 1 — Editor and preview UI

- [x] **1.1 Layout shell.** Top toolbar, split pane (editor left, preview right) with draggable divider, status bar, collapsible right-hand AI panel placeholder. Editor-only / preview-only / split modes. [ED-5]
      Done when: divider drags, modes switch, layout persists across reload.
- [x] **1.2 CodeMirror 6 editor.** Basic setup, line numbers, bracket matching, history, search. Bind to `document.source` in the store. [ED-1]
      Done when: typing updates the store; undo/redo works.
- [x] **1.3 Mermaid language mode.** StreamLanguage or Lezer grammar covering keywords, arrows, strings, comments, `%%{init}%%` directives. [ED-1]
      Done when: a flowchart and a sequence diagram highlight sensibly.
- [x] **1.4 Mermaid renderer.** `mermaid.initialize({ securityLevel: 'strict', startOnLoad: false })`. Render in a `useMermaid` hook with a 250 ms debounce. Output SVG string into a sandboxed container. [ED-2, ED-9]
      Done when: edits re-render within ~300 ms; no `dangerouslySetInnerHTML` outside the preview container.
- [x] **1.5 Error handling.** Catch `mermaid.parse` errors, show message + line in the status bar and as a CodeMirror gutter/line decoration. Keep last valid SVG on screen. [ED-3]
      Done when: an invalid edit shows the error and the previous diagram stays visible.
- [x] **1.6 Pan and zoom.** Wheel zoom, drag pan, fit-to-screen, reset, zoom percentage indicator. [ED-4]
      Done when: a large diagram can be navigated with mouse and keyboard.
- [x] **1.7 Export.** SVG download, PNG download at 1x/2x/4x via canvas, copy SVG and copy source to clipboard. [ED-7]
      Done when: all four actions produce correct output for a sample diagram.
- [x] **1.8 Mermaid theme selector.** Toolbar dropdown for default/dark/forest/neutral/base; respects in-source `%%{init}%%`. Stored in the document, not settings. [ED-6]
      Done when: switching theme re-renders and the choice travels with the document.
- [x] **1.9 Autosave.** Persist `document` slice to IndexedDB (idb-keyval) on change; restore on boot. `beforeunload` guard when dirty. [PR-1, PR-2]
      Done when: reload restores unsaved text; closing a dirty tab prompts.
- [x] **1.10 Templates.** "New from template" menu with one starter per diagram type. [ED-8]
      Done when: each template renders without error.
- [x] **1.11 Keyboard shortcuts.** Cmd/Ctrl+S save, +O open, +N new, +Shift+A toggle AI panel, +Shift+F format. Shortcut cheat-sheet dialog. [ED-10]
      Done when: shortcuts fire and the cheat-sheet lists them.
- [x] **1.13 Beautiful themes.** Theme registry with two engines; beautiful-mermaid renders supported types, Mermaid renders the rest with a fallback notice; lazy-loaded chunk; CSP-safe SVG (no web-font import); share links carry the theme with a Mermaid fallback for mermaid.live. [ED-6, ED-11, ED-13, UR-4]
      Done when: default flowchart renders via beautiful-mermaid; pie falls back with a notice; theme survives a share link.
- [x] **1.14 ASCII preview mode.** SVG/ASCII toggle in the preview, Unicode or plain characters, copy and `.txt` export. [ED-12]
      Done when: ASCII view shows box-drawing text for a flowchart and a clear message for a Gantt chart.
- [ ] **1.12 Web Worker render (stretch, deferred).** Move `mermaid.render` into a worker if main-thread stalls exceed 100 ms on a 200-node diagram.
      Done when: typing stays responsive on the stress fixture.

## Phase 2 — URL state and sharing

- [x] **2.1 Codec module.** `src/share/codec.ts` with `encodeState` / `decodeState`. Raw DEFLATE via `CompressionStream('deflate-raw')`, base64url without padding. Pure, no React. [UR-2, UR-4]
      Done when: round-trip unit tests pass, including unicode and empty input.
- [x] **2.2 mermaid.live compatibility.** Use `#pako:` prefix and `{ code, mermaid: { theme } }` payload shape. Test against a real mermaid.live link fixture. [UR-3]
      Done when: a mermaid.live link opens in Sirenes and vice versa.
- [x] **2.3 Fragment sync.** Subscribe to `document.source` + theme, debounce 500 ms, `history.replaceState` the fragment. [UR-1, UR-6]
      Done when: typing updates the address bar without adding history entries.
- [x] **2.4 Boot from fragment.** On load, decode fragment; if autosave also exists and differs, show a "Restore autosave or use link?" dialog. Handle `hashchange` for in-tab navigation. [UR-5, UR-9]
      Done when: shared link opens correctly; corrupt fragment shows an error and falls back.
- [x] **2.5 Share actions.** Toolbar "Copy share link" and "Copy view-only link" (`view: 'preview'` in payload opens preview-only with AI panel closed). Toast on copy. [UR-7]
      Done when: both links open in the intended mode in a fresh tab.
- [x] **2.6 Length guard.** Warn in the status bar past 8 000 chars, block fragment writes past 32 000 with a message suggesting file or Drive save. [UR-8]
      Done when: oversized fixture triggers both thresholds.
- [x] **2.7 Fallback encoding.** `#base64:` uncompressed path when `CompressionStream` is missing. [UR-11]
      Done when: codec tests pass with `CompressionStream` stubbed out.

## Phase 3 — AI integration (OpenRouter)

- [x] **3.1 Settings panel.** API key input (masked, show/hide), "remember on this device" (`localStorage`) vs "this session only" (`sessionStorage`), validate via `GET /api/v1/auth/key`, remove button. [AI-1]
      Done when: a valid key shows the account label; invalid key shows an error.
- [x] **3.2 OpenRouter client.** `src/ai/openrouter.ts`: `listModels()`, `chat()` with SSE streaming via `ReadableStream`, `AbortController` support, `HTTP-Referer` and `X-Title` headers. [AI-4, AI-10]
      Done when: unit tests with a mocked fetch verify streaming chunk assembly and abort.
- [x] **3.3 Model selector.** Searchable dropdown from `listModels()`, pin favourites, show context length and price per 1M tokens. Persist choice. [AI-2]
      Done when: search filters and favourites survive reload.
- [x] **3.4 Prompt builder.** System prompt instructing: return the full updated Mermaid in one ` ```mermaid ` block, preserve unrelated content, no prose unless asked. Include current source and last N turns. [AI-3]
      Done when: snapshot test of the assembled messages for a sample request.
- [x] **3.5 Chat panel UI.** Message list, streaming assistant bubble, input with Cmd/Ctrl+Enter, cancel button, error states (401, 402, 429, network). [AI-3, AI-4]
      Done when: a real request streams and can be cancelled mid-way.
- [x] **3.6 Proposal extraction and validation.** Extract the fenced block, run `mermaid.parse`; if invalid, mark the proposal as broken and offer "Ask the model to fix". [AI-5, AI-7]
      Done when: a deliberately broken reply is caught and the fix flow works.
- [x] **3.7 Diff view.** Unified/side-by-side diff (CodeMirror merge view) between current source and proposal. Accept applies as a single undoable transaction; Reject discards. [AI-5, AI-6]
      Done when: Accept then Cmd/Ctrl+Z restores the original in one step.
- [x] **3.8 Preset actions.** Buttons: Fix syntax, Explain, Simplify, Tidy layout, Convert to <type>. "Generate from description" is the composer's default when the editor is empty. [AI-8]
      Done when: each preset produces a sensible prompt and, where relevant, a proposal.
- [x] **3.9 Usage display.** Show prompt/completion tokens and cost from `usage` when returned. [AI-9]
      Done when: a completed request shows numbers matching the OpenRouter dashboard.
- [x] **3.10 Per-document history.** Store conversation in IndexedDB keyed by document id; clear on new document unless pinned. [AI-11]
      Done when: reopening the same autosaved document restores the chat.

## Phase 4 — Local file editing

- [x] **4.1 StorageProvider interface.** `src/storage/types.ts` with `open`, `save`, `saveAs`, optional `checkConflict`. Document store tracks `source`, `provider`, `handle`, `dirty`. [FS-5]
      Done when: interface is typed and a fake provider passes the contract test.
- [x] **4.2 File System Access provider.** `showOpenFilePicker` / `showSaveFilePicker` with `.mmd`, `.mermaid`, `.md` types; write via `createWritable`. Persist handle in IndexedDB and re-request permission on boot. [FS-1, FS-2]
      Done when: open, edit, Cmd/Ctrl+S overwrites the same file in Chrome without a prompt.
- [x] **4.3 Fallback provider.** `<input type="file">` for open, `Blob` + `<a download>` for save with the name from the in-app save panel. Auto-selected when the FSA API is absent. [FS-2]
      Done when: open/save works in Firefox and Safari.
- [x] **4.4 Drag and drop.** Whole-window drop zone with overlay; opens the dropped file via the fallback path. [FS-3]
      Done when: dropping a `.mmd` file loads it.
- [x] **4.5 Title and dirty state.** Tab title `<filename>• — Sirenes` when dirty; toolbar shows file name and provider icon. [FS-5]
      Done when: title updates on edit and on save.
- [x] **4.6 Markdown round-trip.** On `.md` open, extract first ` ```mermaid ` block; on save, splice it back and preserve the rest byte-for-byte. Multiple blocks: pick first, warn. [FS-4]
      Done when: a fixture README round-trips with only the block changed.
- [x] **4.7 Recent files.** List of persisted local handles (Drive ids added in 5.7) in the File menu. [FS-6]
      Done when: a recently opened local file reopens from the menu.

## Phase 5 — Google Drive integration

- [x] **5.1 Google Cloud setup.** OAuth "Web application" client, Picker API key, enable Drive API, consent screen with privacy page link. Document steps in `docs/GOOGLE_SETUP.md`. [GD-1]
      Done when: env vars are documented and a dev origin is authorised.
- [x] **5.2 GIS token client.** Load `gsi/client`, `initTokenClient` with `drive.file` scope, in-memory token with expiry, silent re-prompt on 401. Sign-out revokes. [GD-1, GD-2, GD-7, GD-8]
      Done when: sign-in, expiry handling, and sign-out work; token never appears in storage.
- [x] **5.3 Picker.** Google Picker filtered to `.mmd`/`.mermaid`/`.md`/`text/plain`, single select. [GD-3]
      Done when: picking a file returns its id and name.
- [x] **5.4 Drive provider.** `files.get?alt=media` for open; `files.create` multipart for save-as, into a Picker-chosen folder; `files.update` for save. Store `id`, `name`, `modifiedTime`. [GD-4]
      Done when: open → edit → save → reopen shows the edit.
- [x] **5.5 Conflict detection.** Before `files.update`, fetch `modifiedTime`; if newer than opened, show "Overwrite / Save as copy / Cancel". [GD-5]
      Done when: editing the file in Drive web between open and save triggers the dialog.
- [x] **5.6 Deep links and Open-with.** Handle `?state={"ids":[...]}` from Drive "Open with" and a plain `?driveId=` param; configure the Drive UI integration in Cloud Console. [GD-6]
      Done when: "Open with Sirenes" from Drive loads the file.
- [x] **5.7 Recent Drive files.** Add Drive entries to the recent list from 4.7. [FS-6]
      Done when: a Drive file reopens from the menu after re-auth.

## Phase 6 — Polish and release

- [x] **6.1 Clear all data.** Settings action wiping `localStorage`, `sessionStorage`, IndexedDB, and revoking the Google token. Confirmation dialog. [PR-3]
      Done when: after clearing, the app boots as a fresh install.
- [x] **6.2 Privacy page.** Static route listing exactly what leaves the browser, to whom, and that share links contain the full diagram. Linked from footer and Google consent screen. [PR-5]
      Done when: page is live and referenced in the OAuth consent config.
- [x] **6.3 Accessibility pass.** Keyboard traversal, focus rings, ARIA labels on icon buttons, SVG `<title>`, contrast check. Lighthouse a11y ≥ 90.
      Done when: axe reports no serious issues.
- [x] **6.4 Offline behaviour.** Detect `navigator.onLine`; disable Drive/AI controls with a tooltip; editor keeps working. Optional service worker for asset caching (not done).
      Done when: the app functions offline after first load.
- [x] **6.5 E2E smoke suite.** Playwright: type → render, share link round-trip, local open/save (Chromium), AI flow against a mocked OpenRouter.
      Done when: suite runs in CI in under 5 minutes.
- [x] **6.6 Performance budget.** Code-split Mermaid and CodeMirror; Lighthouse perf ≥ 90; initial JS under 300 kB gzipped before lazy chunks.
      Done when: bundle analyzer and Lighthouse confirm the budget.
- [x] **6.7 Docs and release.** README with screenshots, `docs/GOOGLE_SETUP.md`, CHANGELOG, `v1.0.0` tag, pinned Mermaid version shown in the UI footer.
      Done when: a stranger can clone, configure, and deploy from the README alone.

---

## Phase 7 — Live collaboration (peer-to-peer)

Design in PRD section 6.7. Host/guest star topology over PeerJS data channels, Yjs CRDT for the text, nothing about AI or files ever enters the shared document.

- [x] **7.1 Transport.** `src/collab/transport.ts`: PeerJS wrapper with a small interface (`connect`, `send`, `onMessage`, `onPeer`, `close`) so tests can swap in an in-memory/BroadcastChannel fake. Random 24-char session ids. Configurable signalling via `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH`, `VITE_PEER_ICE` (JSON). Lazy chunk. [LC-1, LC-12, LC-13]
      Done when: two tabs exchange messages through the fake transport in a unit test, and through the real PeerJS cloud in a manual check.
- [x] **7.2 Shared document.** Yjs `Y.Doc` with `Y.Text` for source and `Y.Map` for theme + session title. A PeerJS provider that broadcasts Yjs updates (host relays to other guests) and syncs state on join. `y-codemirror.next` binding replaces the plain editor document while in a session; `UndoManager` scoped to the local client. [LC-2, LC-4]
      Done when: concurrent edits in two fake-transport clients converge; undo in one client never reverts the other's text.
- [x] **7.3 Presence.** Yjs awareness over the same channel: name, colour, cursor, selection. Remote cursors in the editor, participant chips in the toolbar. Name stored in localStorage. [LC-10]
      Done when: a second client's cursor is visible and labelled.
- [x] **7.4 Session UI.** "Share live" in the Share menu opens a panel: start/stop, session title, copy link, "guests can edit" toggle, participant list, connection state. Guest join flow from `#live:<id>` with a banner while connecting; "Undo" toast if it replaced unsaved work. [LC-1, LC-9, LC-14]
      Done when: host starts, guest joins from the link, both see each other, host can stop.
- [x] **7.5 Guest restrictions and privacy boundary.** Guests: session title instead of file name, "Shared by" badge, File menu reduced to Save a copy (local / own Drive) and Export, no origin. Host: normal File menu. URL fragment sync paused in-session; address bar shows the live link; Share menu still builds a `#pako:` link from current content. [LC-3, LC-5, LC-6, LC-11]
      Done when: a unit test proves the shared Y.Doc contains only source, theme and title; e2e shows the guest's File menu has no Save.
- [x] **7.6 Lifecycle.** Guest auto-reconnect for 30 s; host id persisted in sessionStorage for reload-resume; on host end or timeout guests get "Session ended" and keep an ordinary local document with autosave. Read-only enforcement when editing is off. Plain error message when the connection cannot be established. [LC-7, LC-8, LC-9, LC-12]
      Done when: closing the host tab leaves the guest editable with the last content and a clear notice.
- [x] **7.7 Tests and docs.** Unit tests with the fake transport; e2e with two pages in one browser context using the BroadcastChannel fake; a documented manual check against the real PeerJS server. README section, privacy dialog updated, `docs/COLLAB.md` with self-hosting `peer` and TURN notes. CSP `connect-src` gains the signalling host (`wss:`).
      Done when: e2e covers join, edit both ways, guest Save a copy, host end.

## Dependency notes

- Phase 2 needs 1.2, 1.4, 1.8 (source, render, theme in the store).
- Phase 3 needs 1.2 and 1.5 (editor transactions, `mermaid.parse` for validation).
- Phase 4.1 should land before 5.4 so Drive is just another `StorageProvider`.
- 6.2 (privacy page) blocks Google OAuth verification, so start it during Phase 5 even though it sits in Phase 6.
- Google OAuth app verification can take weeks. Open the request as soon as 5.1 is done.

## Out of scope for v1

Collaboration, non-Mermaid diagram languages, drag-and-drop WYSIWYG editing, Google Docs export, server-side anything.
