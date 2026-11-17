const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 8e6,
  cors: { origin: true }
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_TEXT_LENGTH = 2000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

function makeCode() {
  let code;
  do {
    const bytes = crypto.randomBytes(6);
    code = Array.from(bytes, b => CODE_CHARS[b % CODE_CHARS.length]).join("");
  } while (rooms.has(code));
  return code;
}

function cleanName(value) {
  const name = String(value || "").replace(/[<>]/g, "").trim().slice(0, 24);
  return name || `Guest-${crypto.randomInt(100, 1000)}`;
}

function roomSnapshot(room) {
  return {
    code: room.code,
    participants: room.participants.size,
    messages: room.messages
  };
}

function destroyRoom(code, reason = "participant-left") {
  const room = rooms.get(code);
  if (!room || room.ended) return;

  room.ended = true;
  // Notify everyone before removing the room. Payload intentionally contains no room data.
  for (const socketId of room.participants.keys()) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit("room:ended", { reason });
      socket.leave(code);
      socket.data.roomCode = null;
    }
  }

  // Clear all ephemeral content and invalidate the code.
  room.messages.length = 0;
  room.participants.clear();
  rooms.delete(code);
}

io.on("connection", socket => {
  socket.on("room:create", ({ name } = {}, callback = () => {}) => {
    if (socket.data.roomCode) return callback({ ok: false, error: "You are already in a room." });

    const code = makeCode();
    const participant = { id: socket.id, name: cleanName(name) };
    const room = {
      code,
      participants: new Map([[socket.id, participant]]),
      messages: [],
      ended: false,
      createdAt: Date.now()
    };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.data.displayName = participant.name;
    socket.join(code);
    callback({ ok: true, code, name: participant.name });
    io.to(code).emit("room:state", roomSnapshot(room));
  });

  socket.on("room:join", ({ code, name } = {}, callback = () => {}) => {
    if (socket.data.roomCode) return callback({ ok: false, error: "You are already in a room." });
    const normalized = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const room = rooms.get(normalized);
    if (!room || room.ended) return callback({ ok: false, error: "Room not found or has ended." });

    const participant = { id: socket.id, name: cleanName(name) };
    room.participants.set(socket.id, participant);
    socket.data.roomCode = normalized;
    socket.data.displayName = participant.name;
    socket.join(normalized);
    callback({ ok: true, code: normalized, name: participant.name });
    io.to(normalized).emit("room:state", roomSnapshot(room));
    io.to(normalized).emit("system:notice", { text: `${participant.name} joined the room` });
  });

  socket.on("message:send", (payload = {}, callback = () => {}) => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room || room.ended || !room.participants.has(socket.id)) {
      return callback({ ok: false, error: "This room is no longer active." });
    }

    const text = String(payload.text || "").trim().slice(0, MAX_TEXT_LENGTH);
    let image = null;
    if (payload.image) {
      const candidate = String(payload.image);
      const match = candidate.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) return callback({ ok: false, error: "Please upload a valid image." });
      const estimatedBytes = Math.floor(match[2].length * 3 / 4);
      if (estimatedBytes > MAX_IMAGE_BYTES) {
        return callback({ ok: false, error: "Images must be 5 MB or smaller." });
      }
      image = candidate;
    }
    if (!text && !image) return callback({ ok: false, error: "Write a message or attach an image." });

    const message = {
      id: crypto.randomUUID(),
      sender: room.participants.get(socket.id).name,
      senderId: socket.id,
      text,
      image,
      time: Date.now()
    };
    room.messages.push(message);
    io.to(code).emit("message:new", message);
    callback({ ok: true });
  });

  socket.on("room:leave", () => {
    const code = socket.data.roomCode;
    if (code) destroyRoom(code, "participant-left");
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    if (code) destroyRoom(code, "participant-left");
  });
});

server.listen(PORT, () => {
  console.log(`Quick Temp Chat running at http://localhost:${PORT}`);
});
