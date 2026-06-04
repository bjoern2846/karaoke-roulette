"use client";

import { useState, useEffect } from "react";
import { useGameSocket } from "./hooks/useGameSocket";
import GameScreen from "./components/GameScreen";
import { soundManager } from "./lib/soundManager";

// ─── Sound Controls (Lobby) ───────────────────────────────────────────────────

function SoundControls() {
  const [mounted, setMounted] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(0.7);

  useEffect(() => {
    setMounted(true);
    setMutedState(soundManager.isMuted());
    setVolumeState(soundManager.getVolume());
  }, []);

  function handleToggleMute() {
    const m = !muted;
    soundManager.setMuted(m);
    setMutedState(m);
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value) / 100;
    soundManager.setVolume(v);
    setVolumeState(v);
  }

  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-semibold text-sm">Lautstärke</p>
          <p className="text-white/40 text-xs">App-Sounds</p>
        </div>
        <button
          onClick={handleToggleMute}
          className="text-xl hover:scale-110 transition-transform"
          title={muted ? "Ton einschalten" : "Ton ausschalten"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={handleVolume}
          disabled={muted}
          className="flex-1 accent-pink-500 disabled:opacity-40 cursor-pointer"
        />
        <span className="text-white/60 text-sm font-mono w-10 text-right shrink-0">
          {muted ? "—" : `${Math.round(volume * 100)}%`}
        </span>
      </div>
    </div>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({
  onCreateRoom,
  onJoinRoom,
  serverError,
  clearError,
  isConnected,
}: {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (name: string, code: string) => void;
  serverError: string | null;
  clearError: () => void;
  isConnected: boolean;
}) {
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // During SSR / first paint: act as if connected (no hydration mismatch).
  // Real connection state kicks in after mount.
  const connected = mounted ? isConnected : true;

  const error = serverError ?? localError;

  function handleCreate() {
    setLocalError(null);
    clearError();
    if (!playerName.trim()) { setLocalError("Spielername eingeben."); return; }
    onCreateRoom(playerName.trim());
  }

  function handleJoin() {
    setLocalError(null);
    clearError();
    if (!playerName.trim()) { setLocalError("Spielername eingeben."); return; }
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 5) { setLocalError("Raumcode muss genau 5 Zeichen haben."); return; }
    if (!/^[A-Z0-9]+$/.test(code)) { setLocalError("Ungültiger Raumcode."); return; }
    onJoinRoom(playerName.trim(), code);
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-purple-900 via-pink-800 to-indigo-900 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl sm:text-6xl mb-3">🎤</div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight drop-shadow-lg">
            Karaoke<span className="text-yellow-400"> Roulette</span>
          </h1>
          <p className="mt-3 text-pink-200 text-base sm:text-lg font-medium">
            Singe. Rate. Gewinne. Repeat.
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-white/40 text-xs">
              {connected ? "Verbunden" : "Verbinde..."}
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 sm:p-8 shadow-2xl">
          {error && (
            <div className="mb-5 bg-red-500/20 border border-red-500/30 rounded-2xl px-4 py-3 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span className="text-red-300 text-sm font-medium">{error}</span>
            </div>
          )}

          {/* Name input */}
          <div className="mb-5">
            <label className="block text-pink-200 text-xs font-black mb-2 uppercase tracking-widest">
              Dein Spielername
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => { setLocalError(null); clearError(); setPlayerName(e.target.value); }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="z.B. RockStar99"
              maxLength={20}
              className="w-full bg-white/10 border border-white/30 rounded-2xl px-4 py-3.5 text-white text-base placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition"
            />
          </div>

          <div className="border-t border-white/20 my-5" />

          {/* Create button */}
          <div className="mb-5">
            <button
              onClick={handleCreate}
              disabled={!playerName.trim() || !connected}
              className="w-full min-h-14 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-purple-900 font-black text-lg rounded-2xl py-3.5 transition-all active:scale-95 shadow-lg shadow-yellow-400/30"
            >
              🎲 Raum erstellen
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 border-t border-white/20" />
            <span className="text-white/40 text-sm font-medium">oder</span>
            <div className="flex-1 border-t border-white/20" />
          </div>

          {/* Join section */}
          <div>
            <label className="block text-pink-200 text-xs font-black mb-2 uppercase tracking-widest">
              Raumcode eingeben
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                setLocalError(null);
                clearError();
                setJoinCode(e.target.value.toUpperCase().slice(0, 5));
              }}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="XXXXX"
              maxLength={5}
              className="w-full bg-white/10 border border-white/30 rounded-2xl px-4 py-3.5 text-white text-xl placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition font-mono text-center tracking-[0.4em] uppercase mb-3"
            />
            <button
              onClick={handleJoin}
              disabled={!connected}
              className="w-full min-h-14 bg-pink-500 hover:bg-pink-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl py-3.5 transition-all active:scale-95 shadow-lg shadow-pink-500/30"
            >
              Raum beitreten →
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-6">
          Keine echten Lyrics. Alles erfunden. Alles Spaß.
        </p>
        <div className="flex justify-center mt-3 pb-4">
          <button
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="text-white/20 hover:text-white/50 text-xs transition py-2 px-3"
          >
            🔒 App sperren
          </button>
        </div>

      </div>
    </main>
  );
}

// ─── Lobby Screen ──────────────────────────────────────────────────────────────

function LobbyScreen({
  roomCode,
  players,
  playerName,
  isHost,
  totalRounds,
  playedSongsCount,
  totalSongsCount,
  gameMode,
  onStartGame,
  onSetTotalRounds,
  onResetSongHistory,
  onSetGameMode,
  onLeave,
}: {
  roomCode: string;
  players: { name: string; isHost: boolean }[];
  playerName: string;
  isHost: boolean;
  totalRounds: number;
  playedSongsCount: number;
  totalSongsCount: number;
  gameMode: "online" | "local";
  onStartGame: () => void;
  onSetTotalRounds: (n: number) => void;
  onResetSongHistory: () => void;
  onSetGameMode: (mode: "online" | "local") => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const ROUND_OPTIONS = [3, 5, 8, 10, 15, 20];

  return (
    <main className="min-h-screen bg-linear-to-br from-purple-900 via-pink-800 to-indigo-900 p-4 pb-8">
      <div className="w-full max-w-md mx-auto">

        {/* Header */}
        <div className="text-center pt-6 pb-6">
          <div className="text-5xl mb-2">🎤</div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Karaoke<span className="text-yellow-400"> Roulette</span>
          </h1>
        </div>

        {/* ── Room code ──────────────────────────────────────────────────────── */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-5 shadow-2xl mb-4">
          <p className="text-pink-200 text-xs font-black uppercase tracking-widest text-center mb-3">
            Raumcode
          </p>
          <p className="text-white font-black text-5xl tracking-[0.3em] font-mono text-center mb-3">
            {roomCode}
          </p>
          <button
            onClick={handleCopy}
            className="w-full bg-white/20 hover:bg-white/30 active:scale-95 text-white rounded-2xl py-3 text-base font-bold transition-all"
          >
            {copied ? "✅ Kopiert!" : "📋 Code kopieren"}
          </button>
          <p className="text-white/30 text-sm text-center mt-3">
            Teile diesen Code mit deinen Freunden
          </p>
        </div>

        {/* ── Players ────────────────────────────────────────────────────────── */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-5 shadow-2xl mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-black text-lg">Spieler</h2>
            <span className="bg-white/20 text-white text-sm font-bold px-3 py-1 rounded-full">
              {players.length} / 8
            </span>
          </div>

          <ul className="space-y-2">
            {players.map((player) => {
              const isMe = player.name === playerName;
              return (
                <li
                  key={player.name}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-4 ${
                    isMe
                      ? "bg-yellow-400/15 border border-yellow-400/30"
                      : "bg-white/10"
                  }`}
                >
                  <span className="text-2xl shrink-0">{player.isHost ? "👑" : "🎙️"}</span>
                  <span className={`font-bold flex-1 text-base ${isMe ? "text-yellow-200" : "text-white"}`}>
                    {player.name}
                    {isMe && <span className="text-yellow-400/60 text-sm font-normal ml-2">Du</span>}
                  </span>
                  {player.isHost && (
                    <span className="bg-yellow-400/20 text-yellow-300 text-xs font-black px-2.5 py-1 rounded-full border border-yellow-400/30 shrink-0">
                      HOST
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {players.length < 2 && (
            <p className="text-white/40 text-sm text-center mt-4">
              Warte auf weitere Spieler…
            </p>
          )}
        </div>

        {isHost ? (
          <>
            {/* ── Rounds (host) ──────────────────────────────────────────────── */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-5 shadow-2xl mb-4">
              <p className="text-white font-black text-base mb-1">Rundenanzahl</p>
              <p className="text-white/40 text-sm mb-4">Wie viele Runden gespielt werden</p>
              <div className="flex flex-wrap gap-2">
                {ROUND_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => onSetTotalRounds(n)}
                    className={`min-w-12 h-12 rounded-xl text-base font-black transition-all active:scale-90 px-3 ${
                      totalRounds === n
                        ? "bg-yellow-400 text-purple-900 shadow-lg shadow-yellow-400/30"
                        : "bg-white/15 text-white/70 hover:bg-white/25 hover:text-white"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Game mode (host) ───────────────────────────────────────────── */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-5 shadow-2xl mb-4">
              <p className="text-white font-black text-base mb-1">Spielmodus</p>
              <p className="text-white/40 text-sm mb-4">Wie wird geraten?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => onSetGameMode("online")}
                  className={`rounded-2xl px-4 py-5 text-left transition-all active:scale-95 border-2 ${
                    gameMode === "online"
                      ? "bg-yellow-400/20 border-yellow-400 text-white"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  <p className="font-black text-lg">💬</p>
                  <p className="font-black text-sm mt-1">Online</p>
                  <p className="text-xs mt-0.5 opacity-60">Chat-Raten</p>
                  {gameMode === "online" && <p className="text-yellow-400 text-xs font-black mt-2">✓ Aktiv</p>}
                </button>
                <button
                  onClick={() => onSetGameMode("local")}
                  className={`rounded-2xl px-4 py-5 text-left transition-all active:scale-95 border-2 ${
                    gameMode === "local"
                      ? "bg-yellow-400/20 border-yellow-400 text-white"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  <p className="font-black text-lg">🔔</p>
                  <p className="font-black text-sm mt-1">Local</p>
                  <p className="text-xs mt-0.5 opacity-60">Buzzer-Modus</p>
                  {gameMode === "local" && <p className="text-yellow-400 text-xs font-black mt-2">✓ Aktiv</p>}
                </button>
              </div>
            </div>

            {/* ── Sound controls ─────────────────────────────────────────────── */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-5 shadow-2xl mb-4">
              <SoundControls />
            </div>

            {/* ── Song history ───────────────────────────────────────────────── */}
            {playedSongsCount > 0 && (
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-5 shadow-2xl mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-bold text-base">Song-History</p>
                    <p className="text-white/40 text-sm">{playedSongsCount} / {totalSongsCount} Songs gespielt</p>
                  </div>
                  <button
                    onClick={onResetSongHistory}
                    className="bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-sm font-semibold rounded-xl px-3 py-2 transition-all active:scale-95 shrink-0 ml-3"
                  >
                    🔄 Reset
                  </button>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (playedSongsCount / totalSongsCount) * 100)}%`,
                      background: "linear-gradient(to right, #a855f7, #ec4899)",
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── Start button (host) ────────────────────────────────────────── */}
            <button
              onClick={onStartGame}
              disabled={players.length < 1}
              className="w-full min-h-14 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-purple-900 font-black text-xl rounded-2xl py-4 transition-all active:scale-95 shadow-xl shadow-yellow-400/30 mb-3"
            >
              🚀 Spiel starten ({totalRounds} Runden)
            </button>
          </>
        ) : (
          <>
            {/* ── Settings summary (non-host) ────────────────────────────────── */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-5 shadow-2xl mb-4">
              <p className="text-white/40 text-xs font-black uppercase tracking-widest mb-4">Einstellungen</p>
              <div className="flex gap-4">
                <div className="flex-1 bg-white/5 rounded-2xl px-4 py-4 text-center">
                  <p className="text-white/40 text-xs font-semibold mb-1">Runden</p>
                  <p className="text-yellow-400 font-black text-3xl">{totalRounds}</p>
                </div>
                <div className="flex-1 bg-white/5 rounded-2xl px-4 py-4 text-center">
                  <p className="text-white/40 text-xs font-semibold mb-1">Modus</p>
                  <p className="text-2xl mb-0.5">{gameMode === "online" ? "💬" : "🔔"}</p>
                  <p className="text-white font-bold text-sm">{gameMode === "online" ? "Online" : "Local"}</p>
                </div>
              </div>
            </div>

            {/* ── Sound controls ─────────────────────────────────────────────── */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-5 shadow-2xl mb-4">
              <SoundControls />
            </div>

            {/* ── Waiting banner ─────────────────────────────────────────────── */}
            <div className="bg-white/10 border border-white/20 rounded-2xl py-5 text-center mb-3">
              <p className="text-white font-bold text-lg animate-pulse">⏳ Warte auf Host…</p>
              <p className="text-white/40 text-sm mt-1">Der Host startet das Spiel</p>
            </div>
          </>
        )}

        <button
          onClick={onLeave}
          className="w-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white font-semibold rounded-2xl py-4 transition-all active:scale-95 text-base"
        >
          ← Raum verlassen
        </button>

      </div>
    </main>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const {
    screen, playerName, room, timeLeft, roundEndData, error, isConnected,
    createRoom, joinRoom, startGame, spinGenre, sendMessage, nextRound,
    setTotalRounds, resetToLobby, startNewGame, leaveRoom, clearError,
    resetSongHistory, setGameMode, buzz, judgeBuzz,
  } = useGameSocket();

  if (screen === "game" && room) {
    const me = room.players.find((p) => p.name === playerName);
    const isHost = me?.isHost ?? false;
    const isSinger = me?.isSinger ?? false;

    return (
      <GameScreen
        room={room}
        playerName={playerName}
        isHost={isHost}
        isSinger={isSinger}
        timeLeft={timeLeft}
        roundEndData={roundEndData}
        onSpin={spinGenre}
        onSendMessage={sendMessage}
        onNextRound={nextRound}
        onResetToLobby={resetToLobby}
        onStartNewGame={startNewGame}
        onLeave={leaveRoom}
        onResetSongHistory={resetSongHistory}
        onBuzz={buzz}
        onJudgeBuzz={judgeBuzz}
      />
    );
  }

  if (screen === "lobby" && room) {
    const me = room.players.find((p) => p.name === playerName);
    return (
      <LobbyScreen
        roomCode={room.code}
        players={room.players}
        playerName={playerName}
        isHost={me?.isHost ?? false}
        totalRounds={room.totalRounds}
        playedSongsCount={room.playedSongsCount}
        totalSongsCount={room.totalSongsCount}
        gameMode={room.gameMode}
        onStartGame={startGame}
        onSetTotalRounds={setTotalRounds}
        onResetSongHistory={resetSongHistory}
        onSetGameMode={setGameMode}
        onLeave={leaveRoom}
      />
    );
  }

  return (
    <HomeScreen
      onCreateRoom={createRoom}
      onJoinRoom={joinRoom}
      serverError={error}
      clearError={clearError}
      isConnected={isConnected}
    />
  );
}
