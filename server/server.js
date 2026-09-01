const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const { v4: uuid } = require('uuid');

const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:4200';

// A room is unused if nobody has touched it (joined/estimated/revealed) for this long.
const ROOM_TTL_MS = 60 * 24 * 60 * 60 * 1000; // ~2 months
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // sweep hourly

const DECK = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '?', '☕'];

/**
 * In-memory room store. Nothing here is persisted to disk — restarting the
 * server clears all rooms, and that's fine, this app has no history to keep.
 *
 * rooms: Map<roomId, {
 *   id: string,
 *   name: string,
 *   creatorId: string,        // clientId of whoever created the room
 *   revealed: boolean,
 *   createdAt: number,
 *   lastActivity: number,
 *   participants: Map<clientId, { id, name, estimate: string|null, connected: boolean }>
 * }>
 */
const rooms = new Map();

function touch(room) {
  room.lastActivity = Date.now();
}

// State as seen by one client. Other people's estimate values stay hidden until
// the host reveals, but the requesting client always sees their own pick — the
// server is still the only source of truth, it just trusts you with your vote.
function roomStateFor(room, clientId) {
  return {
    id: room.id,
    name: room.name,
    creatorId: room.creatorId,
    revealed: room.revealed,
    deck: DECK,
    participants: Array.from(room.participants.values()).map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      hasEstimate: p.estimate !== null,
      estimate: room.revealed || p.id === clientId ? p.estimate : null,
    })),
  };
}

// Identity-free view for the REST endpoint, which has no client to key off.
function publicRoomState(room) {
  return roomStateFor(room, null);
}

function broadcastState(io, room) {
  const socketIds = io.sockets.adapter.rooms.get(room.id);
  if (!socketIds) return;
  for (const sid of socketIds) {
    const sock = io.sockets.sockets.get(sid);
    if (sock) sock.emit('room:state', roomStateFor(room, sock.data.clientId));
  }
}

function cleanupStaleRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(id);
    }
  }
}
setInterval(cleanupStaleRooms, CLEANUP_INTERVAL_MS).unref();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// Creating a room is a plain REST call so a shareable link exists immediately,
// independent of any one socket connection.
app.post('/api/rooms', (req, res) => {
  const name = (req.body && req.body.name ? String(req.body.name) : 'Planning session').slice(
    0,
    60,
  );
  const creatorName = (
    req.body && req.body.creatorName ? String(req.body.creatorName) : 'Host'
  ).slice(0, 40);

  const id = uuid().slice(0, 8);
  const creatorId = uuid();
  const room = {
    id,
    name,
    creatorId,
    revealed: false,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    participants: new Map([
      [creatorId, { id: creatorId, name: creatorName, estimate: null, connected: false }],
    ]),
  };
  rooms.set(id, room);

  res.json({ roomId: id, clientId: creatorId });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(publicRoomState(room));
});

// In a combined deploy the built Angular app ships alongside this server, so
// serve it from the same origin (no CORS, deep links fall back to index.html).
// When it isn't present — plain `npm run dev` — this block is simply skipped.
const CLIENT_DIR = path.join(__dirname, '..', 'client', 'dist', 'scrum-poker-client', 'browser');
if (fs.existsSync(path.join(CLIENT_DIR, 'index.html'))) {
  app.use(express.static(CLIENT_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
  });
  console.log(`Serving client from ${CLIENT_DIR}`);
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_ORIGIN } });

io.on('connection', (socket) => {
  socket.on('room:join', ({ roomId, clientId, name }, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack && ack({ error: 'Room not found' });

    const id = clientId || uuid();
    const existing = room.participants.get(id);
    room.participants.set(id, {
      id,
      name: (existing && !name ? existing.name : name) || 'Guest',
      estimate: existing ? existing.estimate : null,
      connected: true,
    });

    socket.data.roomId = roomId;
    socket.data.clientId = id;
    socket.join(roomId);
    touch(room);

    ack && ack({ ok: true, clientId: id, state: roomStateFor(room, id) });
    broadcastState(io, room);
  });

  socket.on('estimate:submit', ({ roomId, clientId, value }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const participant = room.participants.get(clientId);
    if (!participant) return;
    if (!DECK.includes(value)) return;

    participant.estimate = value;
    touch(room);
    broadcastState(io, room);
  });

  socket.on('estimate:clear', ({ roomId, clientId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const participant = room.participants.get(clientId);
    if (!participant) return;

    participant.estimate = null;
    touch(room);
    broadcastState(io, room);
  });

  socket.on('room:reveal', ({ roomId, clientId }) => {
    const room = rooms.get(roomId);
    if (!room || room.creatorId !== clientId) return;

    room.revealed = true;
    touch(room);
    broadcastState(io, room);
  });

  // Start a fresh round: hide estimates again and clear every vote.
  socket.on('room:reset', ({ roomId, clientId }) => {
    const room = rooms.get(roomId);
    if (!room || room.creatorId !== clientId) return;

    room.revealed = false;
    for (const p of room.participants.values()) p.estimate = null;
    touch(room);
    broadcastState(io, room);
  });

  socket.on('disconnect', () => {
    const { roomId, clientId } = socket.data;
    const room = rooms.get(roomId);
    if (!room) return;
    const participant = room.participants.get(clientId);
    if (participant) participant.connected = false;
    touch(room);
    broadcastState(io, room);
  });
});

server.listen(PORT, () => {
  console.log(`Scrum poker server listening on :${PORT}`);
});
