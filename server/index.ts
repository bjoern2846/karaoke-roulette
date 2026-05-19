import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getRoomBySocketId,
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

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ─── Per-room spin phase timeouts (chained: spinning → revealing → playing) ───

const spinTimeouts = new Map<string, ReturnType<typeof setTimeout>[]>();

function clearSpinTimeouts(code: string): void {
  const ts = spinTimeouts.get(code) ?? [];
  ts.forEach(clearTimeout);
  spinTimeouts.delete(code);
}

function scheduleSpinPhases(io: Server, code: string): void {
  clearSpinTimeouts(code);
  const ts: ReturnType<typeof setTimeout>[] = [];

  // After 3 s: transition spinning → revealing (genre shown)
  ts.push(setTimeout(() => {
    const room = revealGenre(code);
    if (room) {
      console.log(`[spin] revealing genre in room ${code}`);
      broadcastRoom(io, room);
    }

    // After 1.5 s more: transition revealing → playing (timer starts)
    ts.push(setTimeout(() => {
      const playing = startPlaying(code);
      if (playing) {
        console.log(`[spin] starting playing phase in room ${code}`);
        broadcastRoom(io, playing);
        startTimer(io, code);
      }
    }, 1500));
  }, 3000));

  spinTimeouts.set(code, ts);
}

// ─── Per-room server-side timers ──────────────────────────────────────────────

const roomTimers = new Map<string, ReturnType<typeof setInterval>>();

function stopTimer(code: string): void {
  const t = roomTimers.get(code);
  if (t) {
    clearInterval(t);
    roomTimers.delete(code);
  }
}

function startTimer(io: Server, code: string): void {
  stopTimer(code); // never allow two intervals on same room

  roomTimers.set(
    code,
    setInterval(() => {
      const result = tickTimer(code);
      if (!result) {
        stopTimer(code);
        return;
      }

      const { room, ended } = result;

      if (ended) {
        stopTimer(code);
        const endData = getEndRoundData(room);
        // Send round-end to everyone (full song reveal for all)
        io.to(code).emit("roundEnded", endData);
        // Send updated room state (ended phase)
        broadcastRoom(io, room);
      } else {
        // Lightweight tick — just timeLeft + chat if chorus drop happened
        io.to(code).emit("timerTick", room.currentRound?.timeLeft ?? 0);
        // On chorus drop, chat updated — send full room update
        if (result.chorusDrop) broadcastRoom(io, room);
      }
    }, 1000)
  );
}

// ─── Broadcast helper (sends per-player sanitized data) ───────────────────────

function broadcastRoom(io: Server, room: Room): void {
  console.log(
    `[broadcast] room=${room.code} phase=${room.phase} round=${room.currentRound?.phase ?? "null"} players=${room.players.length}`
  );
  for (const player of room.players) {
    io.to(player.id).emit("roomUpdated", getRoomData(room, player.id));
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: "/api/socket",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    console.log(`[+] ${socket.id}`);

    // ── createRoom ────────────────────────────────────────────────────────────
    socket.on(
      "createRoom",
      (playerName: string, cb: (res: { room?: unknown; error?: string }) => void) => {
        if (!playerName?.trim()) return cb({ error: "Kein Spielername." });
        const room = createRoom(socket.id, playerName.trim());
        socket.join(room.code);
        console.log(`[room] created ${room.code} by ${playerName}`);
        cb({ room: getRoomData(room, socket.id) });
      }
    );

    // ── joinRoom ──────────────────────────────────────────────────────────────
    socket.on(
      "joinRoom",
      (
        data: { playerName: string; roomCode: string },
        cb: (res: { room?: unknown; error?: string }) => void
      ) => {
        const result = joinRoom(socket.id, data.playerName?.trim(), data.roomCode?.toUpperCase());
        if (result.error) return cb({ error: result.error });
        socket.join(data.roomCode);
        console.log(`[room] ${data.playerName} joined ${data.roomCode}`);
        broadcastRoom(io, result.room!);
        cb({ room: getRoomData(result.room!, socket.id) });
      }
    );

    // ── leaveRoom ─────────────────────────────────────────────────────────────
    socket.on("leaveRoom", (code: string) => {
      socket.leave(code);
      const result = leaveRoom(socket.id);
      if (result.room) broadcastRoom(io, result.room);
    });

    // ── startGame ─────────────────────────────────────────────────────────────
    socket.on("startGame", (code: string) => {
      const room = getRoom(code);
      if (!room) return;
      const host = room.players.find((p) => p.isHost);
      if (host?.id !== socket.id) return; // only host
      const updated = startGame(code);
      if (updated) broadcastRoom(io, updated);
    });

    // ── spinGenre ─────────────────────────────────────────────────────────────
    socket.on("spinGenre", (code: string) => {
      const room = getRoom(code);
      if (!room) return;
      // Only the current singer may spin
      const singer = room.players[room.singerIndex];
      if (singer?.id !== socket.id) return;
      // Block if any active (non-ended) round exists
      if (room.currentRound && room.currentRound.phase !== "ended") return;

      const updated = spinGenre(code);
      if (updated) {
        console.log(`[spin] started for room ${code}`);
        broadcastRoom(io, updated);
        scheduleSpinPhases(io, code); // spinning → revealing → playing
      }
    });

    // ── sendMessage ───────────────────────────────────────────────────────────
    socket.on("sendMessage", (data: { roomCode: string; text: string }) => {
      if (!data.text?.trim()) return;
      const result = handleMessage(data.roomCode, socket.id, data.text.trim());
      if (result) broadcastRoom(io, result.room);
    });

    // ── nextRound ─────────────────────────────────────────────────────────────
    socket.on("nextRound", (code: string) => {
      const room = getRoom(code);
      if (!room) { console.log(`[nextRound] room ${code} not found`); return; }
      const host = room.players.find((p) => p.isHost);
      if (host?.id !== socket.id) { console.log(`[nextRound] rejected — not host`); return; }
      console.log(`[nextRound] room=${code} host=${host.name} players=${room.players.length}`);
      clearSpinTimeouts(code); // cancel any pending spin phase transitions
      stopTimer(code);
      const updated = nextRound(code);
      if (updated) {
        console.log(`[nextRound] new singerIndex=${updated.singerIndex} broadcasting to ${updated.players.length} players`);
        broadcastRoom(io, updated);
      }
    });

    // ── setTotalRounds ────────────────────────────────────────────────────────
    socket.on("setTotalRounds", (data: { code: string; total: number }) => {
      const room = getRoom(data.code);
      if (!room) return;
      const host = room.players.find((p) => p.isHost);
      if (host?.id !== socket.id) return;
      const updated = setTotalRounds(data.code, data.total);
      if (updated) broadcastRoom(io, updated);
    });

    // ── resetToLobby ──────────────────────────────────────────────────────────
    socket.on("resetToLobby", (code: string) => {
      const room = getRoom(code);
      if (!room) return;
      const host = room.players.find((p) => p.isHost);
      if (host?.id !== socket.id) return;
      clearSpinTimeouts(code);
      stopTimer(code);
      const updated = resetToLobby(code);
      if (updated) broadcastRoom(io, updated);
    });

    // ── startNewGame ──────────────────────────────────────────────────────────
    socket.on("startNewGame", (code: string) => {
      const room = getRoom(code);
      if (!room) return;
      const host = room.players.find((p) => p.isHost);
      if (host?.id !== socket.id) return;
      clearSpinTimeouts(code);
      stopTimer(code);
      const updated = startNewGame(code);
      if (updated) broadcastRoom(io, updated);
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`[-] ${socket.id}`);
      const result = leaveRoom(socket.id);
      if (result.code) clearSpinTimeouts(result.code); // room deleted, cancel spin
      if (result.room) broadcastRoom(io, result.room);
    });
  });

  httpServer.listen(port, () => {
    console.log(`\n🎤 Karaoke Roulette ready on http://${hostname}:${port}\n`);
  });
});
