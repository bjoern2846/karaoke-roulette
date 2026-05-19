"use client";

import { useState, useEffect } from "react";
import { useGameSocket } from "./hooks/useGameSocket";
import GameScreen from "./components/GameScreen";

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
    <main className="min-h-screen bg-linear-to-br from-purple-900 via-pink-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="text-6xl mb-3">🎤</div>
          <h1 className="text-5xl font-black text-white tracking-tight drop-shadow-lg">
            Karaoke<span className="text-yellow-400"> Roulette</span>
          </h1>
          <p className="mt-3 text-pink-200 text-lg font-medium">
            Singe. Rate. Gewinne. Repeat.
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-white/40 text-xs">
              {connected ? "Verbunden" : "Verbinde..."}
            </span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 shadow-2xl">
          {error && (
            <div className="mb-4 bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-2">
              <span>⚠️</span>
              <span className="text-red-300 text-sm font-medium">{error}</span>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-pink-200 text-sm font-semibold mb-2 uppercase tracking-widest">
              Dein Spielername
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => { setLocalError(null); clearError(); setPlayerName(e.target.value); }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="z.B. RockStar99"
              maxLength={20}
              className="w-full bg-white/10 border border-white/30 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition"
            />
          </div>

          <div className="border-t border-white/20 my-6" />

          <div className="mb-6">
            <button
              onClick={handleCreate}
              disabled={!playerName.trim() || !connected}
              className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-purple-900 font-black text-lg rounded-xl py-3 transition-all active:scale-95 shadow-lg shadow-yellow-400/30"
            >
              🎲 Raum erstellen
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 border-t border-white/20" />
            <span className="text-white/40 text-sm font-medium">oder</span>
            <div className="flex-1 border-t border-white/20" />
          </div>

          <div>
            <label className="block text-pink-200 text-sm font-semibold mb-2 uppercase tracking-widest">
              Raumcode eingeben
            </label>
            <div className="flex gap-3">
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
                className="flex-1 bg-white/10 border border-white/30 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition font-mono text-center text-lg tracking-widest uppercase"
              />
              <button
                onClick={handleJoin}
                disabled={!connected}
                className="bg-pink-500 hover:bg-pink-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl px-5 py-3 transition-all active:scale-95 shadow-lg shadow-pink-500/30 whitespace-nowrap"
              >
                Beitreten →
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          Keine echten Lyrics. Alles erfunden. Alles Spaß.
        </p>
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
  onStartGame,
  onSetTotalRounds,
  onLeave,
}: {
  roomCode: string;
  players: { name: string; isHost: boolean }[];
  playerName: string;
  isHost: boolean;
  totalRounds: number;
  onStartGame: () => void;
  onSetTotalRounds: (n: number) => void;
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
    <main className="min-h-screen bg-linear-to-br from-purple-900 via-pink-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🎤</div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Karaoke<span className="text-yellow-400"> Roulette</span>
          </h1>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 shadow-2xl mb-4">
          <p className="text-pink-200 text-xs font-semibold uppercase tracking-widest text-center mb-2">
            Raumcode
          </p>
          <div className="flex items-center justify-center gap-4 mb-4">
            <span className="text-white font-black text-4xl tracking-[0.3em] font-mono">
              {roomCode}
            </span>
            <button
              onClick={handleCopy}
              className="bg-white/20 hover:bg-white/30 text-white rounded-xl px-3 py-2 text-sm font-semibold transition-all active:scale-95"
            >
              {copied ? "✅ Kopiert" : "📋 Kopieren"}
            </button>
          </div>
          <p className="text-white/40 text-xs text-center">
            Teile diesen Code mit deinen Freunden
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 shadow-2xl mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">Spieler</h2>
            <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
              {players.length} / 8
            </span>
          </div>

          <ul className="space-y-2">
            {players.map((player) => (
              <li
                key={player.name}
                className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3"
              >
                <span className="text-2xl">{player.isHost ? "👑" : "🎙️"}</span>
                <span className="text-white font-semibold flex-1">
                  {player.name}
                  {player.name === playerName && (
                    <span className="text-white/40 text-xs ml-2">(Du)</span>
                  )}
                </span>
                {player.isHost && (
                  <span className="bg-yellow-400/20 text-yellow-300 text-xs font-bold px-2 py-0.5 rounded-full border border-yellow-400/30">
                    HOST
                  </span>
                )}
              </li>
            ))}
          </ul>

          {players.length < 2 && (
            <p className="text-white/40 text-xs text-center mt-4">
              Warte auf weitere Spieler... (mind. 2 benötigt)
            </p>
          )}
        </div>

        {/* Round count setting */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-5 shadow-2xl mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold text-sm">Rundenanzahl</p>
              <p className="text-white/40 text-xs">Wie viele Runden gespielt werden</p>
            </div>
            {isHost ? (
              <div className="flex items-center gap-2">
                {ROUND_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => onSetTotalRounds(n)}
                    className={`w-9 h-9 rounded-xl text-sm font-black transition-all active:scale-90 ${
                      totalRounds === n
                        ? "bg-yellow-400 text-purple-900"
                        : "bg-white/15 text-white/60 hover:bg-white/25 hover:text-white"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-yellow-400 font-black text-2xl">{totalRounds}</span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {isHost ? (
            <button
              onClick={onStartGame}
              disabled={players.length < 1}
              className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-purple-900 font-black text-lg rounded-xl py-4 transition-all active:scale-95 shadow-lg shadow-yellow-400/30"
            >
              🚀 Spiel starten ({totalRounds} Runden)
            </button>
          ) : (
            <div className="bg-white/10 border border-white/20 rounded-xl py-4 text-center">
              <p className="text-white/60 font-medium animate-pulse">
                ⏳ Warte auf Host...
              </p>
            </div>
          )}

          <button
            onClick={onLeave}
            className="w-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white font-semibold rounded-xl py-3 transition-all active:scale-95 text-sm"
          >
            ← Raum verlassen
          </button>
        </div>
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
        onStartGame={startGame}
        onSetTotalRounds={setTotalRounds}
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
