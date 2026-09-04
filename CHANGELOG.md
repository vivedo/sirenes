# Changelog

## Unreleased

- Phone layout: compact toolbar with File, Share and More menus, Code/Preview switch in a bottom bar, full-screen AI sheet, pinch-to-zoom. Desktop layout unchanged.

- Welcome dialog on first visit (skipped for live-session links); static privacy policy and terms pages; favicon redrawn with smooth sine waves.

- Live sessions share the whole file: every diagram, add/rename/remove by guests, presence per diagram, per-diagram undo.
- AI conversations are per diagram, locally and in shared sessions.
- Diagram separator is now `%% sirenes:diagram <id> <name>`; the old form is still read. Diagram tabs span the full width; click the active tab to rename.

- One file per browser tab: documents are autosaved individually and each tab resumes its own. "New file" opens a new tab; "New diagram" adds a tab inside the file. The template gallery is gone.
- Diagram tab strip no longer shows a scrollbar.

- Fix: reloading the host tab during a live session duplicated the diagram for everyone; the host now resumes with its saved Yjs state.

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
