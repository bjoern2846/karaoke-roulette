import { createServer } from "http";
import { Server } from "socket.io";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  startGame,
  spinGenre,
  revealGenre,
  startPlaying,
  tickTimer,
  handleMessage,
  nextRound,
  getRoomData,
  getEndRoundData,
  setTotalRounds,
  resetToLobby,
  startNewGame,
  type Room,
} from "./roomManager";

const port = parseInt(process.env.PORT ?? "3001", 10);

// Allow any Vercel preview URL + custom origin via env var.
// CORS_ORIGIN can be a comma-separated list:
//   https://karaoke-roulette.vercel.app,https://karaoke-roulette-git-main-user.vercel.app
const rawOrigins = process.env.CORS_ORIGIN ?? "*";
const corsOrigin: string | string[] | RegExp =
  rawOrigins === "*"
    ? "*"
    : rawOrigins.includes(",")
    ? rawOrigins.split(",").map((s) => s.trim())
    : rawOrigins;

const httpServer = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Karaoke Roulette socket server\n");
});

const io = new Server(httpServer, {
  path: "/api/socket",
  cors: { origin: corsOrigin, methods: ["GET", "POST"] },
});

// ─── Per-room spin phase timeouts (chained: spinning → revealing → playing) ───

const spinTimeouts = new Map<string, ReturnType<typeof setTimeout>[]>();

function clearSpinTimeouts(code: string): void {
  const ts = spinTimeouts.get(code) ?? [];
  ts.forEach(clearTimeout);
  spinTimeouts.delete(code);
}

function scheduleSpinPhases(code: string): void {
  clearSpinTimeouts(code);
  const ts: ReturnType<typeof setTimeout>[] = [];

  ts.push(setTimeout(() => {
    const room = revealGenre(code);
    if (room) {
      console.log(`[spin] revealing genre in room ${code}`);
      broadcastRoom(room);
    }

    ts.push(setTimeout(() => {
      const playing = startPlaying(code);
      if (playing) {
        console.log(`[spin] starting playing phase in room ${code}`);
        broadcastRoom(playing);
        startTimer(code);
      }
    }, 1500));
  }, 3000));

  spinTimeouts.set(code, ts);
}

// ─── Per-room server-side timers ──────────────────────────────────────────────

const roomTimers = new Map<string, ReturnType<typeof setInterval>>();

function stopTimer(code: string): void {
  const t = roomTimers.get(code);
  if (t) { clearInterval(t); roomTimers.delete(code); }
}

function startTimer(code: string): void {
  stopTimer(code);
  roomTimers.set(code, setInterval(() => {
    const result = tickTimer(code);
    if (!result) { stopTimer(code); return; }

    const { room, ended } = result;
    if (ended) {
      stopTimer(code);
      const endData = getEndRoundData(room);
      io.to(code).emit("roundEnded", endData);
      broadcastRoom(room);
    } else {
      io.to(code).emit("timerTick", room.currentRound?.timeLeft ?? 0);
      if (result.chorusDrop) broadcastRoom(room);
    }
  }, 1000));
}

// ─── Broadcast helper ─────────────────────────────────────────────────────────

function broadcastRoom(room: Room): void {
  for (const player of room.players) {
    io.to(player.id).emit("roomUpdated", getRoomData(room, player.id));
  }
}

// ─── Socket handlers ──────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on("createRoom", (playerName: string, cb: (res: { room?: unknown; error?: string }) => void) => {
    if (!playerName?.trim()) return cb({ error: "Kein Spielername." });
    const room = createRoom(socket.id, playerName.trim());
    socket.join(room.code);
    console.log(`[room] created ${room.code} by ${playerName}`);
    cb({ room: getRoomData(room, socket.id) });
  });

  socket.on("joinRoom", (data: { playerName: string; roomCode: string }, cb: (res: { room?: unknown; error?: string }) => void) => {
    const result = joinRoom(socket.id, data.playerName?.trim(), data.roomCode?.toUpperCase());
    if (result.error) return cb({ error: result.error });
    socket.join(data.roomCode);
    console.log(`[room] ${data.playerName} joined ${data.roomCode}`);
    broadcastRoom(result.room!);
    cb({ room: getRoomData(result.room!, socket.id) });
  });

  socket.on("leaveRoom", (code: string) => {
    socket.leave(code);
    const result = leaveRoom(socket.id);
    if (result.room) broadcastRoom(result.room);
  });

  socket.on("startGame", (code: string) => {
    const room = getRoom(code);
    if (!room) return;
    if (room.players.find((p) => p.isHost)?.id !== socket.id) return;
    const updated = startGame(code);
    if (updated) broadcastRoom(updated);
  });

  socket.on("spinGenre", (code: string) => {
    const room = getRoom(code);
    if (!room) return;
    const singer = room.players[room.singerIndex];
    if (singer?.id !== socket.id) return;
    if (room.currentRound && room.currentRound.phase !== "ended") return;
    const updated = spinGenre(code);
    if (updated) {
      broadcastRoom(updated);
      scheduleSpinPhases(code);
    }
  });

  socket.on("sendMessage", (data: { roomCode: string; text: string }) => {
    if (!data.text?.trim()) return;
    const result = handleMessage(data.roomCode, socket.id, data.text.trim());
    if (result) broadcastRoom(result.room);
  });

  socket.on("nextRound", (code: string) => {
    const room = getRoom(code);
    if (!room) return;
    if (room.players.find((p) => p.isHost)?.id !== socket.id) return;
    clearSpinTimeouts(code);
    stopTimer(code);
    const updated = nextRound(code);
    if (updated) broadcastRoom(updated);
  });

  socket.on("setTotalRounds", (data: { code: string; total: number }) => {
    const room = getRoom(data.code);
    if (!room) return;
    if (room.players.find((p) => p.isHost)?.id !== socket.id) return;
    const updated = setTotalRounds(data.code, data.total);
    if (updated) broadcastRoom(updated);
  });

  socket.on("resetToLobby", (code: string) => {
    const room = getRoom(code);
    if (!room) return;
    if (room.players.find((p) => p.isHost)?.id !== socket.id) return;
    clearSpinTimeouts(code);
    stopTimer(code);
    const updated = resetToLobby(code);
    if (updated) broadcastRoom(updated);
  });

  socket.on("startNewGame", (code: string) => {
    const room = getRoom(code);
    if (!room) return;
    if (room.players.find((p) => p.isHost)?.id !== socket.id) return;
    clearSpinTimeouts(code);
    stopTimer(code);
    const updated = startNewGame(code);
    if (updated) broadcastRoom(updated);
  });

  socket.on("disconnect", () => {
    console.log(`[-] ${socket.id}`);
    const result = leaveRoom(socket.id);
    if (result.code) clearSpinTimeouts(result.code);
    if (result.room) broadcastRoom(result.room);
  });
});

// ─── Listen ───────────────────────────────────────────────────────────────────

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`\n🎤 Karaoke Roulette socket server ready on port ${port}\n`);
});
