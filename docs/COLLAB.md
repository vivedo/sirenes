# Live collaboration

Sirenes can share a diagram live between browsers. Sessions are WebRTC data channels brokered by a PeerJS signalling server; diagram content travels only on the encrypted peer channel.

## How it works

- The person who starts sharing is the **host**. Everyone who opens the `#live:<id>` link is a **guest**. Guests connect to the host, who relays edits between guests (star topology).
- Each diagram's text is a Yjs CRDT, so concurrent edits merge without anyone blocking anyone. Undo only reverts your own edits to the diagram you are viewing.
- **Shared:** the whole file (every diagram: id, name and source), the diagram theme, the session title, presence (name, colour, cursor, which diagram each person is viewing). Guests with edit permission can add, rename and remove diagrams.
- **Shared assistant:** the host's AI chat is shared, one conversation per diagram. Guests send requests over the session; the host executes them with its own OpenRouter key and model and publishes the conversation (messages, proposals, usage, author names) to guests. Guests never see the key and never talk to OpenRouter. Accept/reject from a guest goes through the host and follows the edit permission. The host can switch this off.
- **Never shared:** the AI key, UI settings, file name and origin, local file handles, Google Drive identity or token, recent files. These are never written to the shared document, so they are not merely hidden.
- Guests see the session title and a "Shared by" badge instead of the host's file name. Their File menu offers only "Save a copy" (own device or own Drive) and Export. Only the host saves to the original.
- When the host ends the session, or has been unreachable for 30 seconds, guests keep the last synced diagram as an ordinary local document.
- The host's session id and the shared document's Yjs state are kept in `sessionStorage`; reloading the host tab resumes the same link with the same history, so reconnecting guests merge cleanly instead of duplicating the text.

## Signalling server

By default Sirenes uses the public PeerJS cloud server (`0.peerjs.com`). It has no SLA and applies rate limits. It sees peer ids and connection metadata, never content.

To self-host, run the reference server and point the build at it:

```sh
npx peer --port 9000 --path /sirenes
```

```sh
VITE_PEER_HOST=peer.example.com
VITE_PEER_PORT=443
VITE_PEER_PATH=/sirenes
```

The build adds `wss://` and `https://` for that host to the Content Security Policy.

## NAT traversal

WebRTC needs a path between the two browsers. With STUN alone (the default) most home and office networks work, but symmetric NATs and strict corporate firewalls do not. If a guest sees "Could not join", the fallback is the static share link from the Share menu.

To support those networks, add a TURN server. Any provider works; pass the ICE configuration as JSON:

```sh
VITE_PEER_ICE='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]'
```

TURN credentials in a static build are public. Use time-limited credentials or a TURN service that restricts by origin.

## Security notes

- The session link is a bearer capability: anyone with it can join and, unless the host turns editing off, edit. Share it like a document link and end the session when done.
- Session ids are 24 random characters from a 32-symbol alphabet (about 120 bits).
- Participant names are self-declared and not verified.

## Testing

The end-to-end suite runs with `VITE_COLLAB_TRANSPORT=fake`, a BroadcastChannel transport that lets two tabs of one browser talk without a signalling server. A manual check against the real PeerJS cloud: build normally, open the site in two browsers, start sharing in one, open the link in the other.
