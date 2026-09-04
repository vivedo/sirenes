# Sirenes — Product Requirements Document

**Status:** Draft v0.1
**Date:** 2026-09-04
**Owner:** Edoardo Viviani

---

## 1. Summary

_Sirenes_ is the Latin plural of _siren_, the mermaid of classical myth. The name suits a tool that lives and breathes Mermaid diagrams.

Sirenes is a browser-only editor for [Mermaid](https://mermaid.js.org/) diagrams. Users write Mermaid source in a text editor and see the rendered diagram update live. Diagrams can be opened from and saved to Google Drive or to files on the local disk. An AI assistant tab lets users edit the current diagram through natural-language prompts, using their own OpenRouter API key. The diagram source is also encoded into the page URL, so any diagram can be shared or bookmarked as a link with no storage involved.

Sirenes is a fully static single-page application. It has no backend of its own. The only remote services it talks to are Google (OAuth, Drive API, Picker API) and OpenRouter, and both are called directly from the browser with credentials the user owns.

## 2. Goals

- Provide a fast, distraction-free Mermaid editor with live preview and clear error reporting.
- Let users keep diagrams where they already keep their work: Google Drive and the local file system.
- Let users iterate on diagrams with an LLM without giving up ownership of their data or paying a middleman.
- Make any diagram shareable as a plain URL, with the whole source carried in the link.
- Ship as a static site that can be hosted on any CDN or static host (GitHub Pages, Netlify, Cloudflare Pages, S3).
- Keep no user data anywhere except the user's browser, the user's Drive, and the user's disk.

## 3. Non-goals

- No user accounts, server-side sessions, database, or telemetry backend.
- No real-time multi-user collaboration in v1.
- No proxying of AI requests. The browser calls OpenRouter directly.
- No support for diagram tools other than Mermaid (no PlantUML, D2, Graphviz) in v1.
- No WYSIWYG drag-and-drop diagram editing. Mermaid text is the source of truth.
- No mobile-first layout in v1. The app must not break on mobile, but the primary target is desktop.

## 4. Target users

- **Software engineers and architects** who document systems with Mermaid in READMEs, wikis, and design docs.
- **Product and project managers** who sketch flows, Gantt charts, and state diagrams.
- **Technical writers** who maintain diagram sources alongside docs in Drive.

All target users are comfortable with text-based tools and are willing to bring their own API key for AI features.

## 5. Key user stories

### Editing

- As a user, I can type Mermaid source and see the rendered diagram update within a few hundred milliseconds.
- As a user, when my source has a syntax error, I see the error message and line, and the last valid render stays visible.
- As a user, I can pan and zoom the rendered diagram.
- As a user, I can pick a Mermaid theme (default, dark, forest, neutral, base) and the preview reflects it.
- As a user, I can start from a template for each major diagram type (flowchart, sequence, class, state, ER, Gantt, pie, mindmap, timeline, git graph).
- As a user, I can export the diagram as SVG or PNG and copy the source to the clipboard.

### Sharing via URL

- As a user, the URL in my address bar always reflects the diagram I am editing, so copying it shares my work.
- As a user, I can open a shared Sirenes link and see the diagram immediately, without signing in or loading a file.
- As a user, I can click "Copy share link" and get a URL that opens the current diagram, theme included.
- As a user, I can copy a "view-only" link that opens in preview-only mode.
- As a user, when a diagram is too large to fit in a URL, I am told so and offered Drive or a local file instead.

### Google Drive

- As a user, I can sign in with Google and grant Sirenes access only to files I open or create with it.
- As a user, I can open a diagram from Drive using the Google file picker.
- As a user, I can save the current diagram to Drive as a new file or overwrite the file I opened.
- As a user, I can open Sirenes from a link that includes a Drive file id and have that file load.
- As a user, when the file on Drive changed since I opened it, I am warned before overwriting.
- As a user, I can sign out and Sirenes forgets my Google token.

### Local files

- As a user, I can open a `.mmd`, `.mermaid`, or `.md`-with-mermaid-block file from my disk.
- As a user, I can save changes back to the same local file without a download prompt, in browsers that support the File System Access API.
- As a user, in browsers without that API, I can still open files via a file input and save via download.
- As a user, I can drag a file onto the window to open it.

### AI assistant

- As a user, I can paste my OpenRouter API key and it is stored only in my browser.
- As a user, I can choose a model from the OpenRouter model list.
- As a user, I can type an instruction such as "add an error path from the payment step" and receive a proposed new version of the diagram.
- As a user, I see the proposed change as a diff against my current source and can accept, reject, or edit it.
- As a user, I can ask the assistant to generate a diagram from scratch from a description.
- As a user, I can ask the assistant to explain the current diagram or fix its syntax errors.
- As a user, I can see streaming output while the model responds and cancel a request.
- As a user, I can see a per-request token and cost estimate when OpenRouter returns it.

### Persistence and safety

- As a user, my current work survives a page reload even if I have not saved.
- As a user, I am warned before closing the tab with unsaved changes.
- As a user, I can clear all locally stored data, including API keys and tokens, in one action.

## 6. Functional requirements

### 6.1 Editor and preview

| ID    | Requirement                                                                                                           | Priority |
| ----- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| ED-1  | Code editor with Mermaid syntax highlighting, line numbers, bracket matching, undo/redo.                              | Must     |
| ED-2  | Live render debounced at roughly 250 ms after the last keystroke.                                                     | Must     |
| ED-3  | Parse errors are surfaced inline in the editor and in a status bar. The previous successful render remains displayed. | Must     |
| ED-4  | Preview supports pan, zoom, fit-to-screen, and reset.                                                                 | Must     |
| ED-5  | Split layout with a draggable divider. Editor-only and preview-only modes.                                            | Must     |
| ED-6  | Mermaid theme selector and per-diagram `%%{init}%%` directives are respected.                                         | Should   |
| ED-7  | Export to SVG and PNG at selectable scale. Copy SVG and source to clipboard.                                          | Must     |
| ED-8  | Template gallery for all diagram types supported by the bundled Mermaid version.                                      | Should   |
| ED-9  | Mermaid runs with `securityLevel: 'strict'`. HTML labels are not rendered as raw HTML.                                | Must     |
| ED-10 | Keyboard shortcuts for save, open, new, toggle AI panel, and format.                                                  | Should   |

### 6.2 Files and documents

| ID   | Requirement                                                                                                                                  | Priority |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FS-1 | Native document format is plain Mermaid text with `.mmd` extension and `text/plain` MIME type.                                               | Must     |
| FS-2 | Open and save via File System Access API when available; fall back to `<input type="file">` and download otherwise.                          | Must     |
| FS-3 | Drag-and-drop a file onto the app to open it.                                                                                                | Should   |
| FS-4 | Opening a `.md` file extracts the first ` ```mermaid ` block. Saving writes the block back in place, leaving the rest of the file untouched. | Should   |
| FS-5 | Document title derives from the file name. Unsaved state is shown in the title bar and browser tab.                                          | Must     |
| FS-6 | Recent files list for both local handles (where persistable) and Drive files.                                                                | Could    |

### 6.3 URL state and sharing

| ID    | Requirement                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| UR-1  | The current Mermaid source is encoded into the URL fragment (`#`) on every change, debounced to roughly 500 ms, using `history.replaceState` so it does not pollute browser history. | Must     |
| UR-2  | Encoding is DEFLATE (raw, no zlib header) via the browser `CompressionStream('deflate-raw')` API, then base64url. Decoding uses `DecompressionStream`.                               | Must     |
| UR-3  | Fragment format is `#pako:<base64url>` compatible with the encoding used by mermaid.live, so links interoperate in both directions.                                                  | Should   |
| UR-4  | The payload is a JSON object `{ code, mermaid: { theme }, view? }` so theme and view mode travel with the link.                                                                      | Must     |
| UR-5  | On load, a fragment takes precedence over autosave. If both exist and differ, the user is asked which to keep.                                                                       | Must     |
| UR-6  | The fragment is used, not the query string, so the source never reaches the static host's request logs.                                                                              | Must     |
| UR-7  | "Copy share link" and "Copy view-only link" actions in the toolbar. Shared links open with the AI panel closed.                                                                      | Must     |
| UR-8  | When the encoded URL exceeds 8 000 characters, show a warning that some browsers and chat tools truncate long URLs, and suggest Drive or local save. Hard-stop at 32 000 characters. | Should   |
| UR-9  | A fragment that fails to decompress or parse shows a clear error and falls back to autosave or a blank document.                                                                     | Must     |
| UR-10 | When a file is opened from Drive or disk, the fragment is still updated so the link remains shareable, but the file remains the save target.                                         | Should   |
| UR-11 | Fallback to uncompressed base64url (`#base64:`) when `CompressionStream` is unavailable.                                                                                             | Could    |

### 6.4 Google Drive

| ID   | Requirement                                                                                                           | Priority |
| ---- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| GD-1 | OAuth 2.0 via Google Identity Services with the implicit token flow. No client secret is embedded.                    | Must     |
| GD-2 | Request the `drive.file` scope only. Sirenes can only see files it created or the user picked.                        | Must     |
| GD-3 | Open files with the Google Picker API filtered to `.mmd`, `.mermaid`, `.md`, and `text/plain`.                        | Must     |
| GD-4 | Save creates a new file with `files.create` (multipart upload) or updates in place with `files.update`.               | Must     |
| GD-5 | Track the Drive `modifiedTime` or `headRevisionId` of the opened file. Warn on conflict before overwriting.           | Should   |
| GD-6 | Support the Drive "Open with" integration so Sirenes appears as an app for `.mmd` files. Handle `?state=` deep links. | Could    |
| GD-7 | Token refresh via silent re-prompt when the access token expires (about 1 hour).                                      | Must     |
| GD-8 | Sign out revokes the token and clears it from memory. Tokens are never written to localStorage.                       | Must     |

### 6.5 AI assistant

| ID    | Requirement                                                                                                                                        | Priority |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AI-1  | Settings panel to enter, validate, and remove an OpenRouter API key. Stored in localStorage, optionally session-only.                              | Must     |
| AI-2  | Model selector populated from `GET https://openrouter.ai/api/v1/models`, with search and a pinned favourites list.                                 | Must     |
| AI-3  | Chat-style prompt panel scoped to the current diagram. Each request sends a system prompt, the current source, and recent conversation turns.      | Must     |
| AI-4  | Streaming responses via the OpenAI-compatible chat completions endpoint with `stream: true`. Cancel button aborts the fetch.                       | Must     |
| AI-5  | The model is instructed to return the full updated Mermaid source in a fenced block. Sirenes extracts it and shows a side-by-side or unified diff. | Must     |
| AI-6  | Accept applies the proposal to the editor as one undoable edit. Reject discards it.                                                                | Must     |
| AI-7  | Proposed source is validated with Mermaid before being offered. If invalid, the user is told and can ask the model to fix it.                      | Should   |
| AI-8  | Preset actions: "Generate from description", "Fix syntax", "Explain", "Simplify", "Convert to <type>".                                             | Should   |
| AI-9  | Show token usage and cost from the response `usage` field when present.                                                                            | Could    |
| AI-10 | Requests set the `HTTP-Referer` and `X-Title` headers that OpenRouter recommends for app attribution.                                              | Should   |
| AI-11 | Conversation history is kept per document in the browser and cleared when a new document is opened, unless the user pins it.                       | Could    |

### 6.6 Persistence and privacy

| ID   | Requirement                                                                                                             | Priority |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| PR-1 | Autosave current source, cursor, and layout to IndexedDB or localStorage on every change. Restore on load.              | Must     |
| PR-2 | `beforeunload` warning when there are unsaved changes relative to the last file save.                                   | Must     |
| PR-3 | "Clear all data" action removes autosave, API key, model prefs, recent files, and Google token.                         | Must     |
| PR-4 | No analytics, no third-party scripts beyond Google Identity/Picker and the bundled app.                                 | Must     |
| PR-5 | A privacy page states exactly what leaves the browser and to whom, including that share links contain the full diagram. | Should   |

## 7. Non-functional requirements

- **Static hosting.** Build output is plain HTML, JS, CSS, and assets. No server-side rendering, no serverless functions.
- **Performance.** Initial load under 2 s on a typical broadband connection. Mermaid and the editor are code-split and lazy-loaded where possible. Re-render of a 200-node diagram completes without blocking input.
- **Browser support.** Latest two versions of Chrome, Edge, Firefox, and Safari. File System Access API features degrade gracefully where absent.
- **Accessibility.** Keyboard-navigable UI, visible focus states, ARIA labels on icon buttons, colour contrast meeting WCAG AA. Rendered SVG carries a `<title>` derived from the diagram.
- **Security.** Strict Content Security Policy allowing scripts only from self and Google's identity/picker origins, and `connect-src` limited to self, Google APIs, and OpenRouter. No `eval`. Mermaid `securityLevel: 'strict'`.
- **Offline.** The editor, preview, local file operations, and autosave work offline once the app has loaded. Drive and AI features require connectivity and show a clear offline state.
- **Internationalisation.** UI strings are externalised. English only in v1.
- **Theming.** Light and dark UI themes following system preference with a manual override.

## 8. Architecture

### 8.1 Stack

- **React 19** with TypeScript, built by **Vite**.
- **Mermaid** (latest 11.x) for parsing and as the universal renderer.
- **beautiful-mermaid** (1.x, MIT) as an alternative SVG and ASCII renderer for the diagram types it supports. Exposed themes: zinc light/dark, GitHub light/dark, Catppuccin latte, Tokyo night. The list lives in one registry file and is easy to change.
- **CodeMirror 6** for the editor, with a Mermaid language mode.
- **Zustand** or React context for app state; keep it small.
- **Google Identity Services** (`accounts.google.com/gsi/client`) for OAuth and the **Google Picker API** for file selection. Drive REST v3 called with `fetch`.
- **OpenRouter** chat completions API called with `fetch` and `ReadableStream` parsing for SSE.
- **IndexedDB** via a thin wrapper (idb-keyval) for autosave and persisted file handles.
- **Vitest** and **React Testing Library** for unit tests; **Playwright** for end-to-end smoke tests. **oxlint** and **Prettier** for lint and formatting (oxlint is the Vite 8 template default and replaces ESLint).

### 8.2 Modules

```
src/
  app/            shell, routing, layout, theming
  editor/         CodeMirror setup, Mermaid language, error decorations
  preview/        Mermaid render worker, pan/zoom, export
  documents/      document model, dirty tracking, autosave
  share/          URL fragment codec (CompressionStream + base64url), share links
  storage/
    local/        File System Access + fallback adapters
    drive/        GIS auth, Picker, Drive REST client, conflict detection
  ai/             OpenRouter client, prompt builder, diff, apply
  settings/       API key, model, theme, privacy controls
  shared/         UI primitives, hooks, utils
```

A `StorageProvider` interface abstracts local and Drive backends so the document layer does not know where a file lives:

```ts
interface StorageProvider {
  id: 'local' | 'drive'
  open(): Promise<OpenedDocument>
  save(doc: Document, target?: SaveTarget): Promise<SavedDocument>
  saveAs(doc: Document): Promise<SavedDocument>
  checkConflict?(doc: Document): Promise<ConflictInfo | null>
}
```

The URL codec is a pure module with no React dependency:

```ts
async function encodeState(state: ShareState): Promise<string> // -> "pako:<base64url>"
async function decodeState(fragment: string): Promise<ShareState>
```

Compression pipes the UTF-8 bytes through `new CompressionStream('deflate')`, and the result is base64url-encoded without padding. Decoding reverses the steps with `DecompressionStream`.

### 8.3 Data flow

1. Editor emits source changes into the document store.
2. The preview subscribes, debounces, and renders via Mermaid. Errors go back to the editor decorations.
3. Autosave persists the document store to IndexedDB.
   3a. The share module compresses the source and theme into the URL fragment with `history.replaceState`.
4. Save actions hand the document to the active `StorageProvider`.
5. The AI panel reads the current source, builds a prompt, streams the reply, extracts the fenced Mermaid block, validates it, and offers a diff. Accept writes back into the document store.

### 8.4 Client-side storage

All persistence is in the user's browser. Nothing is written server-side.

| Data                                                              | Store          | Rationale                                                                                                      |
| ----------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| OpenRouter API key                                                | `localStorage` | Must survive reloads and restarts so the user enters it once. Session-only mode uses `sessionStorage` instead. |
| Selected model, favourite models, UI theme, layout, Mermaid theme | `localStorage` | Small, non-sensitive preferences.                                                                              |
| Autosaved document, cursor, per-document AI history               | IndexedDB      | Can grow beyond `localStorage` limits; structured data.                                                        |
| Persisted local file handles (File System Access API)             | IndexedDB      | Handles are structured-cloneable objects and cannot live in `localStorage`.                                    |
| Google OAuth access token                                         | Memory only    | Short-lived, and re-obtainable silently. Keeping it out of storage limits exposure.                            |
| Current diagram source                                            | URL fragment   | Shareability. See section 6.3.                                                                                 |

`localStorage` is the deliberate choice for the API key. It is origin-scoped, the app has a strict CSP and no third-party scripts, and the user controls the key through the settings panel and the "Clear all data" action.

### 8.5 Configuration

Build-time environment variables only:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_API_KEY` (for the Picker)
- `VITE_GOOGLE_APP_ID`
- `VITE_APP_URL` (for OpenRouter attribution headers)

No secrets are shipped. The Google OAuth client is a "Web application" client whose authorised origins are the deployed hosts.

## 9. Security and privacy considerations

- **OpenRouter key in the browser.** The key is stored in localStorage by default. Users are told this plainly and offered a session-only option. Sirenes never sends the key anywhere except `openrouter.ai`.
- **Google token.** Held in memory only. The `drive.file` scope prevents Sirenes from listing or reading files the user did not explicitly select.
- **XSS surface.** Mermaid renders user text into SVG. Strict security level, no `dangerouslySetInnerHTML` outside the sandboxed preview container, and a restrictive CSP.
- **AI output.** Model output is treated as untrusted text. It is validated by the Mermaid parser and shown as a diff. It is never executed and never auto-applied.
- **URL sharing.** Source lives in the fragment, which browsers never send to the server, so the static host cannot log diagram content. Users are reminded that anyone with the link can read the diagram, and that URLs may persist in browser history and chat logs.
- **Supply chain.** Lockfile committed, dependencies pinned, automated audit in CI.

## 10. Milestones

Priority order, set by the owner: UI first, then URL sharing, then AI, then local files, then Google Drive. The detailed backlog lives in [TASKS.md](./TASKS.md).

| Milestone           | Scope                                                                         | Exit criteria                                                                     |
| ------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **M0 Foundation**   | Vite + React + TS scaffold, lint/test/CI, static deploy, CSP, store, theming. | Deployed empty shell with light/dark theme.                                       |
| **M1 Editor UI**    | ED-1 to ED-10, PR-1, PR-2.                                                    | Can write, render, export, navigate, and survive reload.                          |
| **M2 URL sharing**  | UR-1 to UR-9, UR-11.                                                          | Any diagram is shareable as a link; mermaid.live links open.                      |
| **M3 AI assistant** | AI-1 to AI-11.                                                                | Prompt, stream, diff, accept/reject flow works end to end with a real key.        |
| **M4 Local files**  | FS-1 to FS-6.                                                                 | Open and save local `.mmd` and `.md` files in Chrome and Firefox.                 |
| **M5 Google Drive** | GD-1 to GD-8, UR-10.                                                          | Open from Picker, save new, overwrite with conflict warning, Open-with, sign out. |
| **M6 Polish**       | PR-3, PR-5, accessibility, offline, e2e, performance budget, docs.            | Public v1.0.                                                                      |

## 11. Success metrics

Sirenes has no telemetry backend, so metrics come from qualitative feedback and static-host request logs only.

- Time from first visit to first rendered diagram under 30 s for a new user.
- Zero reported data-loss incidents relating to Drive overwrite or autosave.
- AI accept rate, measured locally and shown to the user in a stats view, above 50 % on edit-type prompts.
- Lighthouse performance and accessibility scores above 90.

## 12. Open questions

1. Should `.md` round-tripping (FS-4) be in v1, or should v1 handle only `.mmd`? Recommendation: ship `.mmd` first, add `.md` in M5 if time allows.
2. Should the AI panel support multiple simultaneous diagrams or only the active document? Recommendation: active document only.
3. Do we want an optional Google Docs export (insert the rendered PNG into a Doc)? This needs the `documents` scope and is out of scope for v1 unless requested.
4. Should Drive saves also store a rendered SVG sidecar for preview inside Drive? Adds a second file and complicates conflict tracking. Default to no.
5. Should the URL carry AI conversation history too, or only the diagram? Recommendation: diagram and theme only. History would bloat the link and may contain private prompts.
6. Model default when the user has not chosen one. Candidate: a cheap, fast general model from OpenRouter's list, chosen at runtime rather than hard-coded.

## 13. Risks

| Risk                                                                                                                                      | Impact                                         | Mitigation                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google OAuth app verification for `drive.file` requires a privacy policy and consent screen review.                                       | Blocks public launch.                          | Start verification during M3. Publish privacy page early.                                                                                        |
| File System Access API is missing in Firefox and Safari.                                                                                  | Degraded local file UX on those browsers.      | Fallback path with download-based save. Clear messaging.                                                                                         |
| Mermaid rendering of very large diagrams blocks the main thread.                                                                          | Editor stutter.                                | Render in a Web Worker with OffscreenCanvas-free SVG string output; debounce; show a spinner past 500 ms.                                        |
| LLMs produce syntactically invalid Mermaid.                                                                                               | Frustrating AI loop.                           | Validate before offering; one automatic "fix syntax" retry; show errors to the user.                                                             |
| Users leak their OpenRouter key by sharing screenshots or on shared machines.                                                             | Financial loss for user.                       | Masked input, session-only option, prominent "clear all data" action.                                                                            |
| Long URLs are truncated by some chat tools, email clients, or browsers (Safari and Edge handle about 32 k–80 k characters, older IE 2 k). | Shared link opens a broken or partial diagram. | Length warning at 8 k, hard-stop at 32 k, DEFLATE keeps typical diagrams under 2 k. Offer Drive as the alternative.                              |
| beautiful-mermaid is young (1.x) and has its own parser; it may reject valid Mermaid that mermaid.js accepts, or draw it differently.     | Confusing fallbacks.                           | Mermaid parses first so errors are consistent; the engine falls back to Mermaid with a notice on any beautiful-mermaid failure. Pin the version. |
| Mermaid major version bumps change rendering or syntax.                                                                                   | Existing diagrams break.                       | Pin the version, show it in the UI, upgrade deliberately with a changelog.                                                                       |
