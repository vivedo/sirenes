# Sirenes

Live [Mermaid](https://mermaid.js.org/) diagrams in the browser. Type on the left, see the diagram on the right, share it as a link. No backend: the only services Sirenes talks to are Google Drive and OpenRouter, both directly from your browser with your own credentials.

_Sirenes_ is the Latin plural of _siren_, the mermaid of classical myth.

## Status

Version 1.0.0. All planned phases are implemented and covered by tests. See [CHANGELOG.md](CHANGELOG.md), [docs/PRD.md](docs/PRD.md) for requirements and [docs/TASKS.md](docs/TASKS.md) for the backlog and what was left out.

| Area                                    | State                                                              |
| --------------------------------------- | ------------------------------------------------------------------ |
| Editor and live preview                 | Done                                                               |
| Beautiful themes and ASCII rendering    | Done                                                               |
| Share via URL (mermaid.live compatible) | Done                                                               |
| AI assistant via OpenRouter             | Done, verified against a mocked OpenRouter API                     |
| Local file open and save                | Done                                                               |
| Google Drive open and save              | Done, verified against a stubbed Google API; needs an OAuth client |
| Privacy, clear data, offline awareness  | Done                                                               |

## Features

### Editing

- CodeMirror 6 editor with Mermaid syntax highlighting, inline error markers, search and undo history.
- Live render with a 250 ms debounce. Syntax errors are shown on the offending line and the last good diagram stays on screen.
- Pan and zoom with sharp vector redraws at any zoom level, fit to screen, reset.
- Export to SVG and PNG (1x, 2x, 4x), copy SVG or source.
- Editor-only, split and preview-only layouts. Light and dark UI following your OS with a manual toggle.
- Keyboard shortcuts for save, open, new, layouts, format, share link and the AI panel. Press `?` to list them.

### Themes and rendering

- Two rendering engines behind one theme picker. Six curated [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) themes (zinc light/dark, GitHub light/dark, Catppuccin latte, Tokyo night) draw flowchart, sequence, class, state, ER and XY charts. The five classic Mermaid themes cover every diagram type.
- Mermaid stays the parser for everything, so errors and line numbers are consistent. Diagram types beautiful-mermaid cannot draw fall back to Mermaid with a notice, and the beautiful options are disabled in the picker for them.
- ASCII preview mode: see, copy or download the diagram as Unicode box-drawing or plain ASCII text.
- The beautiful engine and its ELK layout dependency load lazily, only when used. Mermaid core loads on first render.

### Sharing

- The diagram lives in the URL fragment as zlib-deflated base64url (`#pako:…`), the same format as mermaid.live, so links open in either tool. Beautiful themes travel in an extra field with a Mermaid fallback theme for mermaid.live.
- Copy share link and copy view-only link (opens in preview-only mode). A warning appears past 8 000 characters and the fragment stops updating past 32 000.
- Autosave to IndexedDB. If a link and your unsaved work disagree, you choose which to keep.

### AI assistant

- Paste your own OpenRouter key. It is stored in this browser only, in localStorage or for the session, and sent only to openrouter.ai.
- Pick any OpenRouter model, with search, favourites, context length and price per million tokens.
- Ask for changes in plain language. Replies stream in and can be cancelled. The proposed diagram is parsed with Mermaid before it is offered, then reviewed as a side-by-side diff. Accept is a single undo step.
- Presets: fix syntax, explain, simplify, tidy layout, convert to another diagram type. Token and cost usage per reply. Each diagram has its own conversation, which persists in the browser.

### Files

- Local files: open `.mmd`, `.mermaid`, `.txt` or `.md` from disk or by dragging them onto the window. In Chromium browsers Save writes back to the same file through the File System Access API; elsewhere Save downloads. Recent files list.
- No browser pop-ups: Save as uses an in-app panel for the name and destination, and replacing unsaved work shows an Undo toast instead of a confirmation.
- Markdown files round-trip: only the first ```mermaid block is edited, the rest of the file is written back byte for byte.
- One `.mmd` file per browser tab, and as many browser tabs as you like: each tab remembers its own file across reloads. "New file" opens a new tab.
- Several diagrams in one `.mmd` file: tabs across the top add, rename (click the active tab), switch and remove diagrams. On disk they are separated by a `%% sirenes:diagram <id> <name>` comment line that Mermaid ignores and the editor never shows, so every section is still a plain diagram. Files without separators are unchanged. Share links carry all diagrams; exports are named after the active one.
- Google Drive: open with the Google Picker, save in place, or save a new file into a folder you choose with the Picker (the last folder is remembered). Sirenes asks for the `drive.file` scope only, so it can see just the files you pick or create with it. If a file changed on Drive since you opened it, you choose between overwriting and saving a copy. Drive's "Open with" links work. The access token stays in memory and is never stored.

### Live collaboration

- Share → Share live starts a peer-to-peer session and gives you a `#live:` link. Guests who open it edit the whole file with you in real time: every diagram is shared, people can work on different diagrams at once, guests can add and rename diagrams, and undo is per person and per diagram. Text merges through a CRDT (Yjs); WebRTC data channels are brokered by a PeerJS signalling server and carry the content encrypted end to end.
- Only the diagram, its theme, a session title and presence are shared. Your files, Google Drive and AI key never enter the session. Guests see a "Shared by" badge instead of your file name and can only save their own copy; you remain the owner of the original.
- The AI assistant becomes a shared chat, one per diagram: guests type requests, you run them on your key and model, and everyone sees the same conversation with author names. Guests can accept proposals if they may edit. A toggle next to "guests can edit" turns this off.
- Host controls: session title, "guests can edit" and "guests can use my AI assistant" toggles, end session. Guests keep a local copy when the session ends. See [docs/COLLAB.md](docs/COLLAB.md) for self-hosting the signalling server and adding a TURN relay.

### Privacy

- Plain, script-free [privacy policy](public/privacy.html) and [terms of service](public/terms.html) pages are served at `/privacy.html` and `/terms.html`, suitable for Google's OAuth branding review.
- A privacy dialog (status bar link, or open `#privacy`) summarises what leaves the browser and to whom.
- First-time visitors see a short welcome explaining the app in five lines. It is not shown to people arriving through a live-session link.
- "Clear all data" removes the API key, autosave, AI history, recent files and settings, and revokes the Google token.
- Offline: editing, sharing and local files keep working; Drive and AI controls are disabled with a notice.

## Browser support

Latest Chrome, Edge, Firefox and Safari. Save-in-place for local files needs the File System Access API (Chromium); other browsers fall back to downloads. Live collaboration needs WebRTC and a network path between participants; strict NATs may need a TURN server (see docs/COLLAB.md).

## Development

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # Playwright end-to-end suite (first time: npx playwright install chromium)
npm run lint         # oxlint + prettier --check
npm run typecheck    # tsc -b
npm run build        # static output in dist/
```

The end-to-end suite stubs OpenRouter and Google entirely, so it runs without credentials. To use Google Drive in development, copy `.env.example` to `.env` and follow [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md). Nothing is required for the editor, sharing, AI and local file features.

## Deploy

The site is fully static. `.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`:

1. In the repository settings, set **Pages → Source** to _GitHub Actions_.
2. For Google Drive, add `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` as repository **variables** (they are public by design). Add the Pages origin to the OAuth client's authorised origins.
3. The workflow derives the base path and public URL from the Pages configuration, so project pages and custom domains both work without edits. The values are read at build time: after changing the custom domain in the Pages settings, push a commit or re-run the deploy workflow so the assets are rebuilt for the new root.

## Privacy

Diagram content is stored in your browser (IndexedDB and the URL) and nowhere else until you choose to save it to a file or to Drive. Anyone who has a share link can read the diagram in it. Details are in the in-app privacy dialog.
