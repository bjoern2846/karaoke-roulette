import { randomUUID } from "crypto";
import {
  GENRES, SONGS, getSongsByGenre, getRandomSongByGenre,
  matchesTitle, matchesArtist,
} from "../app/data/songs";
import type { Genre, Song } from "../app/data/songs";
import type { ChatMessage, PublicPlayer, PublicRound, PublicRoomData } from "../app/types/game";
import { SCORING } from "../app/constants/scoring";

// ─── Internal types ───────────────────────────────────────────────────────────

interface InternalChatMsg extends ChatMessage {
  maskedText?: string; // set on correct-guess user messages; stripped before sending to other clients
}

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
  disconnected: boolean;
}

interface RoundState {
  genre: Genre;
  songId: string;
  phase: "spinning" | "revealing" | "playing" | "ended";
  timeLeft: number;
  titleFound: boolean;
  artistFound: boolean;
  titleGuessers: string[];
  artistGuessers: string[];
  roundDeltas: Record<string, number>;
}

export interface Room {
  code: string;
  players: Player[];
  phase: "lobby" | "game" | "gameEnded";
  currentRound: RoundState | null;
  chat: InternalChatMsg[];
  singerIndex: number;
  lastSingerId: string | null;
  playedSongIds: Set<string>; // reset per-genre when that genre's pool exhausted
  lastSongId: string | null; // prevents direct back-to-back same song
  totalRounds: number;
  currentRoundNumber: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code: string;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function timestamp(): string {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function makeSystemMsg(text: string): InternalChatMsg {
  return { id: randomUUID(), sender: "System", text, time: timestamp(), isSystem: true };
}

function maskMessage(text: string): string {
  return text.replace(/\S/g, "*");
}

/** Pick a song for the given genre, respecting the global played history and back-to-back prevention. */
function pickSongForGenre(room: Room, genre: Genre, lastSongId: string | null): Song | null {
  const genreSongs = getSongsByGenre(genre);
  if (!genreSongs.length) return null;

  let pool = genreSongs.filter((s) => !room.playedSongIds.has(s.id));
  if (!pool.length) {
    // All songs in this genre played — reset just this genre's entries and start fresh
    for (const s of genreSongs) room.playedSongIds.delete(s.id);
    pool = genreSongs;
  }

  // Avoid direct back-to-back same song (only if alternatives exist)
  const withoutLast = lastSongId ? pool.filter((s) => s.id !== lastSongId) : pool;
  if (withoutLast.length > 0) pool = withoutLast;

  const song = pool[Math.floor(Math.random() * pool.length)];
  room.playedSongIds.add(song.id);
  return song;
}

/** True when every active non-singer has guessed both title and artist. */
function checkAllGuessed(room: Room): boolean {
  if (!room.currentRound) return false;
  const singer = room.players[room.singerIndex];
  const activeGuessers = room.players.filter(
    (p) => !p.disconnected && p.name !== singer?.name
  );
  if (activeGuessers.length === 0) return false;
  const { titleGuessers, artistGuessers } = room.currentRound;
  return activeGuessers.every(
    (p) => titleGuessers.includes(p.name) && artistGuessers.includes(p.name)
  );
}

/** Returns the singerIndex for the next round, skipping the previous singer when possible. */
function advanceSingerIndex(players: Player[], currentIndex: number, lastSingerId: string | null): number {
  if (players.length <= 1) return 0;
  const next = (currentIndex + 1) % players.length;
  // Skip if the next candidate is the same player who just sang
  if (players[next]?.id === lastSingerId) {
    return (next + 1) % players.length;
  }
  return next;
}

function addToChat(room: Room, msg: InternalChatMsg): void {
  room.chat.push(msg);
  if (room.chat.length > 150) room.chat.shift();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createRoom(socketId: string, playerName: string): Room {
  const room: Room = {
    code: generateCode(),
    players: [{ id: socketId, name: playerName, isHost: true, score: 0, disconnected: false }],
    phase: "lobby",
    currentRound: null,
    chat: [],
    singerIndex: 0,
    lastSingerId: null,
    playedSongIds: new Set(),
    lastSongId: null,
    totalRounds: 5,
    currentRoundNumber: 0,
  };
  rooms.set(room.code, room);
  return room;
}

export function joinRoom(
  socketId: string,
  playerName: string,
  code: string
): { room?: Room; error?: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Raum nicht gefunden." };
  if (room.phase === "game") return { error: "Spiel läuft bereits." };
  if (room.players.length >= 8) return { error: "Raum ist voll (max. 8 Spieler)." };
  if (room.players.find((p) => p.name === playerName))
    return { error: `Name "${playerName}" ist bereits vergeben.` };

  room.players.push({ id: socketId, name: playerName, isHost: false, score: 0, disconnected: false });
  addToChat(room, makeSystemMsg(`👋 ${playerName} ist dem Raum beigetreten!`));
  return { room };
}

export function leaveRoom(socketId: string): { room?: Room; code?: string } {
  for (const [code, room] of rooms.entries()) {
    const idx = room.players.findIndex((p) => p.id === socketId);
    if (idx === -1) continue;

    const { name } = room.players[idx];
    room.players.splice(idx, 1);

    if (room.players.length === 0) {
      rooms.delete(code);
      return { code };
    }

    // Transfer host
    if (!room.players.find((p) => p.isHost)) {
      room.players[0].isHost = true;
      addToChat(room, makeSystemMsg(`👑 ${room.players[0].name} ist jetzt Host.`));
    }

    // Keep singerIndex valid
    if (room.singerIndex >= room.players.length) room.singerIndex = 0;

    addToChat(room, makeSystemMsg(`🚪 ${name} hat den Raum verlassen.`));
    return { room, code };
  }
  return {};
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function getRoomBySocketId(socketId: string): { room: Room; code: string } | null {
  for (const [code, room] of rooms.entries()) {
    if (room.players.find((p) => p.id === socketId)) return { room, code };
  }
  return null;
}

export function startGame(code: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;
  room.phase = "game";
  room.singerIndex = 0;
  room.lastSingerId = null; // fresh game, no history
  room.currentRound = null;
  room.currentRoundNumber = 1;
  const firstSinger = room.players[0];
  room.chat = [makeSystemMsg(`🎮 Spiel gestartet! ${firstSinger?.name ?? "Spieler 1"} dreht als erstes das Genre-Roulette.`)];
  return room;
}

export function setTotalRounds(code: string, total: number): Room | null {
  const room = rooms.get(code);
  if (!room || room.phase !== "lobby") return null;
  room.totalRounds = Math.max(1, Math.min(20, Math.round(total)));
  return room;
}

export function resetToLobby(code: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;
  room.phase = "lobby";
  room.currentRound = null;
  room.currentRoundNumber = 0;
  room.singerIndex = 0;
  room.lastSingerId = null;
  // playedSongIds intentionally kept — history persists across games in same room
  room.lastSongId = null;
  room.players.forEach((p) => { p.score = 0; p.disconnected = false; });
  room.chat = [makeSystemMsg("🔄 Zurück in die Lobby.")];
  return room;
}

export function startNewGame(code: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;
  // Avoid giving first singer spot to whoever sang last in previous game
  const singerIndex = advanceSingerIndex(room.players, room.singerIndex, room.lastSingerId);
  room.phase = "game";
  room.singerIndex = singerIndex;
  room.lastSingerId = room.players[singerIndex]?.id ?? null;
  room.currentRound = null;
  room.currentRoundNumber = 1;
  // playedSongIds intentionally kept — history persists across games in same room
  room.lastSongId = null;
  room.players.forEach((p) => { p.score = 0; p.disconnected = false; });
  const firstSinger = room.players[singerIndex];
  room.chat = [makeSystemMsg(`🎮 Neues Spiel! ${firstSinger?.name ?? "Spieler 1"} dreht als erstes das Genre-Roulette.`)];
  return room;
}

export function spinGenre(code: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;
  // Block if a round is already in progress (not ended)
  if (room.currentRound && room.currentRound.phase !== "ended") return null;

  // Only pick from genres that actually have songs to avoid silent failures.
  const availableGenres = GENRES.filter((g) => getSongsByGenre(g).length > 0);
  if (!availableGenres.length) return null;
  const genre = availableGenres[Math.floor(Math.random() * availableGenres.length)];
  const song = pickSongForGenre(room, genre, room.lastSongId);
  if (!song) return null;
  room.lastSongId = song.id;

  room.currentRound = {
    genre,
    songId: song.id,
    phase: "spinning", // genre hidden from clients during this phase
    timeLeft: 60,
    titleFound: false,
    artistFound: false,
    titleGuessers: [],
    artistGuessers: [],
    roundDeltas: {},
  };

  const singer = room.players[room.singerIndex];
  addToChat(room, makeSystemMsg(`🎲 Das Genre-Roulette dreht sich… ${singer?.name ?? "?"} singt gleich!`));

  return room;
}

export function revealGenre(code: string): Room | null {
  const room = rooms.get(code);
  if (!room?.currentRound || room.currentRound.phase !== "spinning") return null;
  room.currentRound.phase = "revealing";
  addToChat(room, makeSystemMsg(`🎉 Genre enthüllt: ${room.currentRound.genre}!`));
  return room;
}

export function startPlaying(code: string): Room | null {
  const room = rooms.get(code);
  if (!room?.currentRound || room.currentRound.phase !== "revealing") return null;
  room.currentRound.phase = "playing";
  const singer = room.players[room.singerIndex];
  addToChat(room, makeSystemMsg(`🎤 ${singer?.name ?? "?"} singt jetzt — rate den Song! ⏱ 60 Sekunden!`));
  return room;
}

export function tickTimer(code: string): { room: Room; chorusDrop: boolean; ended: boolean } | null {
  const room = rooms.get(code);
  if (!room?.currentRound || room.currentRound.phase !== "playing") return null;

  room.currentRound.timeLeft = Math.max(0, room.currentRound.timeLeft - 1);
  const chorusDrop = room.currentRound.timeLeft === 30;
  const ended = room.currentRound.timeLeft === 0;

  if (chorusDrop) {
    addToChat(room, makeSystemMsg("🎵 Chorus Drop! Noch 30 Sekunden — alle raten!"));
  }

  if (ended) {
    room.currentRound.phase = "ended";
  }

  return { room, chorusDrop, ended };
}

export interface GuessResult {
  titleHit: boolean;
  artistHit: boolean;
  room: Room;
  systemMessages: ChatMessage[];
  allGuessed: boolean;
}

export function handleMessage(code: string, socketId: string, text: string): GuessResult | null {
  const room = rooms.get(code);
  if (!room) return null;

  const player = room.players.find((p) => p.id === socketId);
  if (!player) return null;

  const userMsg: InternalChatMsg = {
    id: randomUUID(),
    sender: player.name,
    text,
    time: timestamp(),
    isSystem: false,
  };
  addToChat(room, userMsg);

  const systemMessages: InternalChatMsg[] = [];
  let titleHit = false;
  let artistHit = false;

  const round = room.currentRound;
  const singer = room.players[room.singerIndex];
  const isSinger = singer?.id === socketId;

  if (round && round.phase === "playing" && !isSinger) {
    const song = SONGS.find((s) => s.id === round.songId);
    if (song) {
      const speedBonus = Math.round(SCORING.maxSpeedBonus * round.timeLeft / SCORING.roundDuration);

      // ── Title guess ───────────────────────────────────────────────────────────
      // Any player who hasn't already guessed the title can still earn points.
      if (!round.titleGuessers.includes(player.name) && matchesTitle(text, song)) {
        titleHit = true;
        const placement = round.titleGuessers.length; // 0 = first correct guesser
        round.titleFound = true; // UI indicator
        round.titleGuessers.push(player.name);

        const pts = SCORING.guessTitle + (SCORING.placementBonus[placement] ?? 0) + speedBonus;
        player.score += pts;
        round.roundDeltas[player.name] = (round.roundDeltas[player.name] ?? 0) + pts;

        const titleMsg = makeSystemMsg(`🎯 ${player.name} hat den Titel erkannt! (+${pts})`);
        addToChat(room, titleMsg);
        systemMessages.push(titleMsg);

        if (singer) {
          const singerPts = SCORING.singerTitleRecognized + (SCORING.singerPlacementBonus[placement] ?? 0);
          singer.score += singerPts;
          round.roundDeltas[singer.name] = (round.roundDeltas[singer.name] ?? 0) + singerPts;
          const singerMsg = makeSystemMsg(`🎤 Sänger ${singer.name} bekommt +${singerPts} Punkte!`);
          addToChat(room, singerMsg);
          systemMessages.push(singerMsg);
        }
      }

      // ── Artist guess ──────────────────────────────────────────────────────────
      // Independent of title — tracked and scored separately.
      if (!round.artistGuessers.includes(player.name) && matchesArtist(text, song)) {
        artistHit = true;
        const placement = round.artistGuessers.length; // 0 = first correct guesser
        round.artistFound = true; // UI indicator
        round.artistGuessers.push(player.name);

        const pts = SCORING.guessArtist + (SCORING.placementBonus[placement] ?? 0) + speedBonus;
        player.score += pts;
        round.roundDeltas[player.name] = (round.roundDeltas[player.name] ?? 0) + pts;

        const artistMsg = makeSystemMsg(`🎵 ${player.name} hat den Interpreten erkannt! (+${pts})`);
        addToChat(room, artistMsg);
        systemMessages.push(artistMsg);

        if (singer) {
          const singerPts = SCORING.singerArtistRecognized + (SCORING.singerPlacementBonus[placement] ?? 0);
          singer.score += singerPts;
          round.roundDeltas[singer.name] = (round.roundDeltas[singer.name] ?? 0) + singerPts;
          const singerMsg = makeSystemMsg(`🎤 Sänger ${singer.name} bekommt +${singerPts} Punkte!`);
          addToChat(room, singerMsg);
          systemMessages.push(singerMsg);
        }
      }
    }
  }

  // Mask the user's message for other players if it was a correct guess
  if (titleHit || artistHit) {
    userMsg.maskedText = maskMessage(text);
  }

  const allGuessed = (titleHit || artistHit) ? checkAllGuessed(room) : false;
  return { titleHit, artistHit, room, systemMessages, allGuessed };
}

export function nextRound(code: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;

  // Record who just sang before rotating
  const prevSingerId = room.players[room.singerIndex]?.id ?? null;
  room.lastSingerId = prevSingerId;

  // Last round completed → end the game
  if (room.currentRoundNumber >= room.totalRounds) {
    room.phase = "gameEnded";
    room.currentRound = null;
    const winner = [...room.players].sort((a, b) => b.score - a.score)[0];
    room.chat = [makeSystemMsg(`🏆 Spiel beendet! Gewinner: ${winner?.name ?? "?"} mit ${winner?.score ?? 0} Punkten!`)];
    return room;
  }

  room.currentRoundNumber += 1;
  room.singerIndex = advanceSingerIndex(room.players, room.singerIndex, prevSingerId);
  room.currentRound = null;

  const nextSinger = room.players[room.singerIndex];
  room.chat = [makeSystemMsg(`🔄 Runde ${room.currentRoundNumber} / ${room.totalRounds}! ${nextSinger?.name ?? "?"} dreht das Genre-Roulette.`)];
  return room;
}

// ─── Sanitize for client ──────────────────────────────────────────────────────

export function getRoomData(room: Room, socketId: string): PublicRoomData {
  const singer = room.players[room.singerIndex];
  const isSinger = singer?.id === socketId;
  const me = room.players.find((p) => p.id === socketId);

  const players: PublicPlayer[] = room.players.map((p) => ({
    name: p.name,
    isHost: p.isHost,
    score: p.score,
    isSinger: p.id === singer?.id,
    disconnected: p.disconnected,
  }));

  let publicRound: PublicRound | null = null;
  if (room.currentRound) {
    const r = room.currentRound;
    // Hide genre during spinning — suspense until reveal
    const genreVisible = r.phase !== "spinning";
    // During "ended" phase everyone sees the full song (reveal). Otherwise only the singer.
    const songVisible = r.phase === "ended" || (isSinger && genreVisible);
    const song = songVisible ? SONGS.find((s) => s.id === r.songId) ?? null : null;
    publicRound = {
      genre: genreVisible ? r.genre : null,
      phase: r.phase,
      timeLeft: r.timeLeft,
      titleFound: r.titleFound,
      artistFound: r.artistFound,
      titleGuessers: r.titleGuessers,
      artistGuessers: r.artistGuessers,
      song,
      roundDeltas: r.roundDeltas,
    };
  }

  return {
    code: room.code,
    players,
    phase: room.phase,
    singerName: singer?.name ?? null,
    chat: room.chat.map(({ maskedText, ...base }): ChatMessage => {
      if (maskedText && base.sender !== me?.name) {
        return { ...base, text: maskedText };
      }
      return base;
    }),
    currentRound: publicRound,
    totalRounds: room.totalRounds,
    currentRoundNumber: room.currentRoundNumber,
    playedSongsCount: room.playedSongIds.size,
    totalSongsCount: SONGS.length,
  };
}

export function getEndRoundData(room: Room) {
  const song = room.currentRound ? SONGS.find((s) => s.id === room.currentRound!.songId) : null;
  return {
    song,
    roundDeltas: room.currentRound?.roundDeltas ?? {},
    titleGuessers: room.currentRound?.titleGuessers ?? [],
    artistGuessers: room.currentRound?.artistGuessers ?? [],
  };
}

/** Mark player as disconnected without removing them. Gives 60 s to reconnect. */
export function markDisconnected(socketId: string): { room: Room; playerName: string; roomCode: string } | null {
  for (const [code, room] of rooms.entries()) {
    const player = room.players.find((p) => p.id === socketId);
    if (!player) continue;
    player.disconnected = true;
    addToChat(room, makeSystemMsg(`⚠️ ${player.name} hat die Verbindung verloren…`));
    return { room, playerName: player.name, roomCode: code };
  }
  return null;
}

/** Restore a reconnecting player: update socketId, clear disconnected flag. */
export function reconnectPlayer(socketId: string, playerName: string, roomCode: string): Room | null {
  const room = rooms.get(roomCode);
  if (!room) return null;
  const player = room.players.find((p) => p.name === playerName);
  if (!player) return null;
  player.id = socketId;
  player.disconnected = false;
  addToChat(room, makeSystemMsg(`✅ ${playerName} ist wieder verbunden!`));
  return room;
}

/** Clear the global song history for the room so all songs become available again. */
export function resetSongHistory(code: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;
  room.playedSongIds = new Set();
  room.lastSongId = null;
  addToChat(room, makeSystemMsg("🔄 Song-History zurückgesetzt — alle Songs sind wieder verfügbar!"));
  return room;
}

/** End the round immediately (all guessers scored — no need to wait for timer). */
export function autoEndRound(code: string): Room | null {
  const room = rooms.get(code);
  if (!room?.currentRound || room.currentRound.phase !== "playing") return null;
  room.currentRound.phase = "ended";
  addToChat(room, makeSystemMsg("🎊 Alle haben geraten! Runde vorzeitig beendet!"));
  return room;
}
