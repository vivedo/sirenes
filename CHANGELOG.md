# Changelog

## Unreleased

- Multiple diagrams per file, as tabs above the editor, separated on disk by `%% --- name ---` comment lines.

- Shared AI assistant in live sessions: guests use the host's assistant, one conversation for everyone, host toggle to disable.
- The live collaboration toolbar button toggles its panel.

- Live collaboration: peer-to-peer sessions over PeerJS/WebRTC with Yjs CRDT merging, named cursors, per-user undo, host controls (title, read-only, end), guest-only "Save a copy". Nothing about files, Drive or AI is shared.

- Save to Google Drive into a folder chosen with the Picker; the last folder is remembered.
- In-app save panel replaces `window.prompt`; Undo toast replaces `window.confirm` when new/open would discard unsaved work.
- Wider menus without wrapping; trailing ellipses removed from menu labels.

## 1.0.0 — 2026-09-04

First release.

- Live Mermaid editor (CodeMirror 6) with syntax highlighting, inline errors, templates, export to SVG/PNG.
- Two rendering engines: beautiful-mermaid themes for flowchart, sequence, class, state, ER and XY charts, classic Mermaid themes for everything. ASCII preview mode.
- Share any diagram as a URL (zlib-deflated fragment, mermaid.live compatible). View-only links.
- AI assistant via OpenRouter with your own key: streaming, model picker, proposals reviewed as a diff, presets, usage and cost.
- Local files: File System Access API save-in-place with download fallback, drag and drop, Markdown round-trip, recent files.
- Google Drive: Picker, save in place with conflict detection, "Open with" links. `drive.file` scope only.
- Autosave, link-vs-autosave reconciliation, privacy page, "Clear all data", offline awareness.
