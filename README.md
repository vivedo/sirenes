# Sirenes

Live [Mermaid](https://mermaid.js.org/) diagrams in the browser. Type on the left, see the diagram on the right, share it as a link. No backend: the only services Sirenes talks to are Google Drive and OpenRouter, both directly from your browser with your own credentials.

_Sirenes_ is the Latin plural of _siren_, the mermaid of classical myth.

## Status

| Phase                                   | State   |
| --------------------------------------- | ------- |
| Editor and live preview                 | Done    |
| Share via URL (mermaid.live compatible) | Done    |
| AI assistant via OpenRouter             | Planned |
| Local file open and save                | Planned |
| Google Drive open and save              | Planned |

See [docs/PRD.md](docs/PRD.md) for requirements and [docs/TASKS.md](docs/TASKS.md) for the backlog.

## Features so far

- CodeMirror 6 editor with Mermaid syntax highlighting, inline error markers, search, undo history.
- Live render with a 250 ms debounce. Syntax errors keep the last good diagram on screen.
- Pan and zoom, fit to screen, export to SVG and PNG (1x, 2x, 4x), copy SVG or source.
- Two rendering engines behind one theme picker: six curated [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) themes (zinc, GitHub, Catppuccin latte, Tokyo night) for flowchart, sequence, class, state, ER and XY charts, plus the five classic Mermaid themes for everything. Diagram types beautiful-mermaid cannot draw fall back to Mermaid with a notice.
- ASCII preview mode: see and copy the diagram as Unicode box-drawing or plain ASCII text.
- Light and dark UI following your OS with a manual toggle.
- Templates for flowchart, sequence, class, state, ER, Gantt, pie, mind map, timeline and git graph.
- The diagram lives in the URL fragment as zlib-deflated base64url (`#pako:…`), the same format as mermaid.live, so links open in either tool. View-only links open in preview mode.
- Autosave to IndexedDB. If a link and your unsaved work disagree, you choose which to keep.
- Local files: open `.mmd`, `.mermaid`, `.txt` or `.md` from disk or by dragging them onto the window. In Chromium browsers Save writes back to the same file through the File System Access API; elsewhere Save downloads. Markdown files round-trip: only the first ```mermaid block is edited, the rest of the file is untouched. Recent files list.
- Google Drive: open with the Google Picker, save in place, or save a new file. Sirenes only asks for the `drive.file` scope, so it can only see files you pick or create with it. If the file changed on Drive since you opened it, you choose between overwriting and saving a copy. Drive's "Open with" links work. The access token stays in memory and is never stored.
- Keyboard shortcuts. Press `?` to see them.
- AI assistant: paste your own OpenRouter key (stored in this browser only), pick any OpenRouter model, and ask for changes in plain language. Replies stream in, the proposed diagram is parsed before it is offered, and you review it as a side-by-side diff before accepting. Accept is a single undo step. Presets for fix, explain, simplify, tidy and convert. Token and cost usage per reply.

## Development

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # Playwright smoke tests (needs: npx playwright install chromium)
npm run lint         # oxlint + prettier --check
npm run build        # static output in dist/
```

Copy `.env.example` to `.env` and follow [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) to enable Google Drive. Nothing is required for the editor, sharing, AI and local file features.

## Deploy

The site is fully static. `.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages on every push to `main`. Set `BASE_PATH=/` if you serve from a custom domain.

## Privacy

Diagram content is stored in your browser (IndexedDB and the URL) and nowhere else until you choose to save it to a file or to Drive. Anyone who has a share link can read the diagram in it.
