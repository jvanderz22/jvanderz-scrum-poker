# Scrum Poker

A minimal planning-poker app: create a room, share the link, everyone picks a
card, the host reveals when ready.

```
server/   Node + Express + Socket.io — in-memory rooms, no database
client/   Angular 17 (standalone components) — home page + room page
```

## How it works

- **Create a room** — `POST /api/rooms` on the server makes a room and
  returns a `roomId` (used in the shareable link `/room/:id`) and a
  `clientId` for the creator, who becomes the room's host.
- **Join a room** — visiting `/room/:id` connects a websocket and emits
  `room:join`. First-time visitors are asked for a name; the resulting
  `clientId` is kept in `sessionStorage` so a page refresh rejoins the same
  seat instead of creating a new one.
- **Estimate** — picking a card emits `estimate:submit`. The server tracks
  who *has* estimated but only sends the actual value to everyone once the
  host reveals — hiding estimates is enforced server-side, not just in the UI.
- **Reveal / new round** — only the host's `clientId` (checked against
  `room.creatorId` on the server) can reveal or reset a room.
- **No history** — everything lives in a `Map` in server memory. A background
  sweep every hour deletes any room that hasn't been touched (joined,
  estimated, revealed, or reset) in about 2 months. Restarting the server
  also clears everything — there's nothing to persist.

## Run it locally

**Server**
```bash
cd server
npm install
npm start          # listens on :3000
```

**Client**
```bash
cd client
npm install
npm start           # ng serve, http://localhost:4200
```

Open `http://localhost:4200`, create a room, and share the printed URL.

## Configuration

- `server/server.js` reads `PORT` and `CLIENT_ORIGIN` env vars (defaults
  `3000` and `http://localhost:4200`) for the CORS/socket allowlist.
- `client/src/app/env.ts` has `API_BASE`, the URL the client calls for both
  REST and the websocket. Point it at your deployed server when you build
  for production.

## Notes / next steps if you want them

- Deck values are fixed in `server.js` (`DECK`) — swap in your own scale.
- Disconnected participants stay in the room (greyed out) so people can
  rejoin after a dropped connection; nobody is ever forcibly removed.
