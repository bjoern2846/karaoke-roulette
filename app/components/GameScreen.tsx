"use client";

import { useState, useEffect, useRef } from "react";
import type { PublicRoomData, RoundEndData, Song } from "../types/game";
import { hasRealLyrics } from "../data/songs";
import { GENRES, getGenreColor, getGenreIcon } from "../constants/genres";
import { soundManager } from "../lib/soundManager";

// ─── YouTube IFrame API types (minimal) ──────────────────────────────────────

declare global {
  interface Window {
    YT: {
      Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number }) => void;
    onError?: () => void;
  };
}
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  unMute(): void;
  setVolume(v: number): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getPlayerState(): number;
  destroy(): void;
}

// ─── YT API loader (singleton) ────────────────────────────────────────────────

let _ytLoaded = false;
let _ytLoading = false;
const _ytCallbacks: Array<() => void> = [];

function loadYTApi(cb: () => void): void {
  if (_ytLoaded && window.YT?.Player) { cb(); return; }
  _ytCallbacks.push(cb);
  if (_ytLoading) return;
  _ytLoading = true;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => {
    _ytLoaded = true;
    _ytCallbacks.splice(0).forEach((fn) => fn());
  };
}

// ─── Constants & helpers ──────────────────────────────────────────────────────
const ROUND_DURATION = 60;

function formatCountdown(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/** Accepts full YouTube URLs or bare video IDs. Returns the 11-char ID or null. */
function extractYouTubeId(input: string): string | null {
  if (!input?.trim()) return null;
  const s = input.trim();
  // youtube.com/watch?v=ID or &v=ID
  const watchMatch = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  // youtu.be/ID
  const shortMatch = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  // youtube.com/embed/ID
  const embedMatch = s.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  // bare 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  return null;
}

// ─── YouTube Embed (IFrame API — unmuted autoplay with fallback button) ───────

function YouTubeEmbed({ videoId, startSeconds }: { videoId: string; startSeconds: number }) {
  const cleanId = extractYouTubeId(videoId);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (!cleanId || !mountRef.current) return;
    let destroyed = false;
    let fallbackTimer: ReturnType<typeof setTimeout>;

    loadYTApi(() => {
      if (destroyed || !mountRef.current) return;

      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId: cleanId,
        playerVars: {
          start: Math.max(0, Math.floor(startSeconds)),
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady(e) {
            e.target.unMute();
            e.target.setVolume(100);
            e.target.seekTo(startSeconds, true);
            e.target.playVideo();
            // Give browser 2.5 s to start playing; show button if still blocked
            fallbackTimer = setTimeout(() => {
              if (!destroyed && playerRef.current?.getPlayerState() !== 1) {
                setShowButton(true);
              }
            }, 2500);
          },
          onStateChange(e) {
            // 1 = PLAYING
            if (e.data === 1) setShowButton(false);
          },
          onError() {
            setShowButton(true);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      clearTimeout(fallbackTimer);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [cleanId, startSeconds]);

  function handleStartWithSound() {
    const p = playerRef.current;
    if (!p) return;
    p.unMute();
    p.setVolume(100);
    p.seekTo(startSeconds, true);
    p.playVideo();
    setShowButton(false);
  }

  if (!cleanId) {
    return (
      <div className="w-full rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center py-8 text-white/30 text-sm">
        Kein YouTube-Video konfiguriert.
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ paddingBottom: "56.25%" }}>
      {/* IFrame API mounts here */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Fallback button — only shown when autoplay with sound was blocked */}
      {showButton && (
        <button
          onClick={handleStartWithSound}
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-3 bg-black/70 z-10 cursor-pointer hover:bg-black/60 transition"
        >
          <span className="text-5xl">🔊</span>
          <span className="text-white font-black text-lg">Video mit Sound starten</span>
          <span className="text-white/40 text-sm">Browser hat Autoplay blockiert</span>
        </button>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface GameScreenProps {
  room: PublicRoomData;
  playerName: string;
  isHost: boolean;
  isSinger: boolean;
  timeLeft: number;
  roundEndData: RoundEndData | null;
  onSpin: () => void;
  onSendMessage: (text: string) => void;
  onNextRound: () => void;
  onResetToLobby: () => void;
  onStartNewGame: () => void;
  onLeave: () => void;
}

// ─── UI phase derivation ──────────────────────────────────────────────────────

type UIPhase = "idle" | "spinning" | "revealing" | "singing" | "ended";

// ─── Root component ───────────────────────────────────────────────────────────

export default function GameScreen(props: GameScreenProps) {
  const { room, playerName, isHost, isSinger, timeLeft, roundEndData, onSpin, onSendMessage, onNextRound, onResetToLobby, onStartNewGame, onLeave } = props;

  // Cycling genre display during server-managed "spinning" phase
  const [cyclingGenre, setCyclingGenre] = useState(GENRES[0]);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive UI phase directly from server state (single source of truth)
  const uiPhase: UIPhase = (() => {
    const p = room.currentRound?.phase;
    if (!p) return "idle";
    if (p === "spinning") return "spinning";
    if (p === "revealing") return "revealing";
    if (p === "playing") return "singing";
    return "ended";
  })();

  // ── Sound setup ─────────────────────────────────────────────────────────────
  // Preload once on mount
  useEffect(() => { soundManager.preload(); }, []);

  // Phase-change sounds (useRef to avoid firing on initial render)
  const prevUiPhaseRef = useRef<UIPhase | null>(null);
  useEffect(() => {
    const prev = prevUiPhaseRef.current;
    prevUiPhaseRef.current = uiPhase;
    if (prev === null || prev === uiPhase) return; // first render or no change
    if (uiPhase === "revealing") soundManager.play("genreReveal");
  }, [uiPhase]);

  // Round-end countdown — plays once when timeLeft hits 5 during singing phase
  const roundEndSoundFiredRef = useRef(false);
  useEffect(() => {
    // Reset the guard each time a new round starts (phase enters singing)
    if (uiPhase !== "singing") {
      roundEndSoundFiredRef.current = false;
      return;
    }
    if (timeLeft === 3 && !roundEndSoundFiredRef.current) {
      roundEndSoundFiredRef.current = true;
      soundManager.play("roundEnd");
    }
  }, [uiPhase, timeLeft]);

  // Correct-guess sound — only for new chat messages, not history on reconnect
  const prevChatLenRef = useRef<number>(room.chat.length);
  useEffect(() => {
    const prev = prevChatLenRef.current;
    prevChatLenRef.current = room.chat.length;
    if (room.chat.length <= prev) return; // chat cleared or no new messages
    const newMsgs = room.chat.slice(prev);
    const hasGuess = newMsgs.some(
      (m) => m.isSystem && (
        m.text.includes("hat den Titel erkannt") ||
        m.text.includes("hat den Interpreten erkannt")
      )
    );
    if (hasGuess) soundManager.play("correctGuess");
  }, [room.chat]);

  // Start/stop genre cycling based on server phase
  useEffect(() => {
    if (uiPhase === "spinning") {
      let idx = 0;
      cycleRef.current = setInterval(() => {
        idx = (idx + 1) % GENRES.length;
        setCyclingGenre(GENRES[idx]);
      }, 80);
    } else {
      if (cycleRef.current) { clearInterval(cycleRef.current); cycleRef.current = null; }
    }
    return () => { if (cycleRef.current) clearInterval(cycleRef.current); };
  }, [uiPhase]);

  // Callbacks wrapped with audio unlock + click sound
  function withClick<T extends unknown[]>(fn: (...args: T) => void) {
    return (...args: T) => {
      soundManager.unlock();
      soundManager.play("click");
      fn(...args);
    };
  }

  // Final ranking screen
  if (room.phase === "gameEnded") {
    return (
      <FinalRankingScreen
        players={room.players}
        isHost={isHost}
        onResetToLobby={onResetToLobby}
        onStartNewGame={onStartNewGame}
        onLeave={onLeave}
      />
    );
  }

  const round = room.currentRound;
  const timerPct = Math.max(0, (timeLeft / ROUND_DURATION) * 100);
  const timerColor = timeLeft > 30 ? "#4ade80" : timeLeft > 10 ? "#facc15" : "#f87171";

  const phaseLabel: Record<UIPhase, string> = {
    idle: "🎲 Warte auf Genre",
    spinning: "🎲 Genre wird gerollt…",
    revealing: "🎉 Genre enthüllt!",
    singing: "🎤 Sänger ist dran!",
    ended: "⏰ Runde beendet",
  };

  // Displayed genre — real genre when revealed/playing, cycling animation when spinning
  const displayedGenre =
    uiPhase === "spinning"
      ? cyclingGenre
      : room.currentRound?.genre ?? GENRES[0];

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-purple-950 to-slate-950 flex flex-col">

      {/* ── Sticky top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 shrink-0 h-16 bg-black/60 backdrop-blur-md border-b border-white/10 flex items-center px-4 gap-4">
        {/* Logo - desktop only */}
        <span className="hidden lg:block text-white font-black text-lg tracking-tight shrink-0">
          🎤 <span className="text-yellow-400">Karaoke</span> Roulette
        </span>

        {/* Timer */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {(uiPhase === "singing" || uiPhase === "ended" || uiPhase === "revealing") ? (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-black text-3xl font-mono tabular-nums transition-colors"
                  style={{ color: timerColor }}
                >
                  {formatCountdown(timeLeft)}
                </span>
                {timeLeft <= 30 && uiPhase === "singing" && (
                  <span className="text-yellow-400 text-xs font-black animate-pulse">CHORUS DROP!</span>
                )}
              </div>
              {/* Progress bar */}
              <div className="w-40 h-1 bg-white/10 rounded-full overflow-hidden mt-0.5">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${timerPct}%`, backgroundColor: timerColor }}
                />
              </div>
            </>
          ) : (
            <span className="text-white/30 font-mono text-xl">—:——</span>
          )}
        </div>

        {/* Phase + round */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:block text-white/60 text-sm font-semibold">{phaseLabel[uiPhase]}</span>
          {room.currentRoundNumber > 0 && (
            <span className="bg-white/10 border border-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              Runde {room.currentRoundNumber} / {room.totalRounds}
            </span>
          )}
        </div>
      </header>

      {/* ── 3-column body ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:grid lg:grid-cols-[256px_1fr_256px] flex-1">

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col gap-3 p-4 border-r border-white/10 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto">
          {/* Room info */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Raum</p>
            <p className="text-white font-black text-2xl font-mono tracking-widest">{room.code}</p>
          </div>

          {/* Your player */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Du</p>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                {initials(playerName)}
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">{playerName}</p>
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {isHost && <span className="text-yellow-400 text-xs font-bold">👑 HOST</span>}
                  {isSinger && <span className="text-pink-400 text-xs font-bold">🎤 SÄNGER</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Current singer */}
          {room.singerName && (
            <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-4">
              <p className="text-yellow-400/70 text-xs uppercase tracking-widest mb-2">Aktueller Sänger</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-purple-900 font-black text-xs shrink-0">
                  {initials(room.singerName)}
                </div>
                <p className="text-yellow-300 font-bold text-sm truncate">{room.singerName}</p>
              </div>
            </div>
          )}

          {/* Current genre */}
          {round?.genre && (() => {
            const gc = getGenreColor(round.genre);
            return (
              <div
                className="rounded-2xl p-4 border"
                style={{ backgroundColor: `${gc}15`, borderColor: `${gc}40` }}
              >
                <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Genre</p>
                <p className="font-black text-lg" style={{ color: gc }}>
                  {getGenreIcon(round.genre)} {round.genre}
                </p>
              </div>
            );
          })()}

          {/* Guess status badges */}
          {round && (round.titleFound || round.artistFound) && (
            <div className="flex gap-2 flex-wrap">
              {round.titleFound && (
                <span className="bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-bold px-2 py-1 rounded-full">
                  Titel ✓
                </span>
              )}
              {round.artistFound && (
                <span className="bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold px-2 py-1 rounded-full">
                  Artist ✓
                </span>
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* Leave */}
          <button
            onClick={onLeave}
            className="w-full text-white/40 hover:text-white hover:bg-white/10 border border-white/10 rounded-xl py-2 text-sm font-semibold transition"
          >
            ← Raum verlassen
          </button>
        </aside>

        {/* ── Center column ─────────────────────────────────────────────────── */}
        <div className="flex flex-col min-h-0">

          {/* Mobile info strip */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-black/20 text-sm overflow-x-auto shrink-0">
            <span className="text-white font-mono font-black tracking-widest shrink-0">{room.code}</span>
            <span className="text-white/20">·</span>
            <span className="text-white/60 shrink-0">{playerName}</span>
            {isHost && <span className="text-yellow-400 font-bold shrink-0">👑</span>}
            {room.singerName && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-yellow-300 shrink-0">🎤 {room.singerName}</span>
              </>
            )}
            {round?.genre && uiPhase !== "spinning" && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-pink-300 shrink-0">{getGenreIcon(round.genre ?? "")} {round.genre}</span>
              </>
            )}
            <button onClick={onLeave} className="ml-auto text-white/30 hover:text-white shrink-0">✕</button>
          </div>

          {/* Main phase content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* IDLE / SPINNING: Roulette */}
            {(uiPhase === "idle" || uiPhase === "spinning") && (
              <RouletteCard
                displayedGenre={displayedGenre}
                isSpinning={uiPhase === "spinning"}
                isSinger={isSinger}
                singerName={room.singerName}
                onSpin={withClick(() => {
                  soundManager.play("wheelSpin");
                  onSpin();
                })}
              />
            )}

            {/* REVEALING: Big genre reveal */}
            {uiPhase === "revealing" && round?.genre && (
              <GenreRevealCard
                genre={round.genre}
                singerName={room.singerName}
                isSinger={isSinger}
              />
            )}

            {/* SINGING: Singer or spectator */}
            {uiPhase === "singing" && (
              isSinger
                ? <SingerCard song={round!.song} playerName={playerName} round={round!} />
                : <SpectatorCard genre={round!.genre ?? ""} singerName={room.singerName} round={round!} />
            )}

            {/* ENDED state (before overlay) — show waiting message */}
            {uiPhase === "ended" && !roundEndData && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <p className="text-white/40 animate-pulse">Lade Rundenauswertung…</p>
              </div>
            )}
          </div>

          {/* Chat panel */}
          <div className="shrink-0 border-t border-white/10 bg-black/20">
            <ChatPanel
              messages={room.chat}
              playerName={playerName}
              disabled={uiPhase !== "singing" || isSinger}
              placeholder={
                isSinger ? "Sänger können nicht raten…"
                  : uiPhase !== "singing" ? "Warte auf nächste Runde…"
                  : "Tipp eingeben und Enter drücken…"
              }
              onSend={onSendMessage}
            />
          </div>
        </div>

        {/* ── Right sidebar: Leaderboard ────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col gap-3 p-4 border-l border-white/10 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto">
          <LeaderboardPanel players={room.players} currentPlayer={playerName} />
        </aside>
      </div>

      {/* Mobile leaderboard (below chat) */}
      <div className="lg:hidden p-4 border-t border-white/10">
        <LeaderboardPanel players={room.players} currentPlayer={playerName} />
      </div>

      {/* Round summary overlay */}
      {roundEndData && (
        <RoundSummaryOverlay
          song={roundEndData.song}
          roundDeltas={roundEndData.roundDeltas}
          titleGuessers={roundEndData.titleGuessers}
          artistGuessers={roundEndData.artistGuessers}
          players={room.players}
          isHost={isHost}
          isLastRound={room.currentRoundNumber >= room.totalRounds}
          onNextRound={withClick(onNextRound)}
        />
      )}
    </div>
  );
}

// ─── Roulette Card ────────────────────────────────────────────────────────────

function RouletteCard({ displayedGenre, isSpinning, isSinger, singerName, onSpin }: {
  displayedGenre: string;
  isSpinning: boolean;
  isSinger: boolean;
  singerName: string | null;
  onSpin: () => void;
}) {
  const color = getGenreColor(displayedGenre);
  return (
    <div
      className="rounded-3xl p-8 flex flex-col items-center gap-6 min-h-64 border transition-all duration-150"
      style={{
        backgroundColor: `${color}10`,
        borderColor: isSpinning ? `${color}60` : `${color}25`,
        boxShadow: isSpinning ? `0 0 40px ${color}30` : "none",
      }}
    >
      <div className={`transition-all duration-75 ${isSpinning ? "scale-110" : ""}`}>
        <div
          className={`text-8xl select-none ${isSpinning ? "animate-bounce" : ""}`}
          style={{ filter: isSpinning ? "blur(1px)" : "none" }}
        >
          {getGenreIcon(displayedGenre)}
        </div>
      </div>

      <div className="text-center">
        <p
          className="font-black text-4xl tracking-tight transition-all"
          style={{ color: isSpinning ? "#fde047" : color, filter: isSpinning ? "blur(1px)" : "none" }}
        >
          {displayedGenre}
        </p>
        {isSpinning && (
          <p className="text-yellow-400/70 text-sm font-semibold mt-2 animate-pulse">
            Genre wird ausgewählt…
          </p>
        )}
      </div>

      {isSinger ? (
        <button
          onClick={onSpin}
          disabled={isSpinning}
          className="disabled:opacity-50 disabled:cursor-not-allowed font-black text-xl rounded-2xl px-10 py-4 transition-all active:scale-95 shadow-xl text-white"
          style={{ backgroundColor: color, boxShadow: `0 8px 24px ${color}40` }}
        >
          {isSpinning ? "🎲 Dreht…" : "🎲 Genre drehen"}
        </button>
      ) : (
        <div className="text-center">
          <p className="text-white/40 font-semibold">
            {isSpinning ? (
              <span className="animate-pulse text-yellow-300/70">Genre wird gewählt…</span>
            ) : singerName ? (
              <>Warte, bis <span className="text-yellow-300">{singerName}</span> das Genre dreht…</>
            ) : (
              "Warte auf den Sänger…"
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Genre Reveal Card ────────────────────────────────────────────────────────

function GenreRevealCard({ genre, singerName, isSinger }: {
  genre: string;
  singerName: string | null;
  isSinger: boolean;
}) {
  const color = getGenreColor(genre);
  return (
    <div
      className="rounded-3xl p-10 flex flex-col items-center gap-6 animate-in fade-in zoom-in-75 duration-500 border-2"
      style={{
        backgroundColor: `${color}12`,
        borderColor: `${color}60`,
        boxShadow: `0 0 60px ${color}35`,
      }}
    >
      <p className="text-sm font-bold uppercase tracking-widest" style={{ color: `${color}cc` }}>
        🎉 Das Genre ist…
      </p>

      <div className="text-center space-y-3">
        <div className="text-9xl animate-bounce">
          {getGenreIcon(genre)}
        </div>
        <div
          className="rounded-2xl px-8 py-4 border"
          style={{ backgroundColor: `${color}20`, borderColor: `${color}50` }}
        >
          <p className="font-black text-5xl tracking-tight" style={{ color }}>
            {genre}
          </p>
        </div>
      </div>

      <p className="text-white/50 text-base text-center">
        {isSinger ? (
          <span className="font-bold" style={{ color }}>Du singst gleich! Mach dich bereit…</span>
        ) : singerName ? (
          <><span className="font-bold" style={{ color }}>{singerName}</span> singt gleich!</>
        ) : (
          "Runde startet gleich…"
        )}
      </p>
    </div>
  );
}

// ─── Singer Card ──────────────────────────────────────────────────────────────

function SingerCard({ song, playerName, round }: {
  song: Song | null;
  playerName: string;
  round: NonNullable<PublicRoomData["currentRound"]>;
}) {
  if (!song) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center">
        <p className="text-white/40">Lade Song…</p>
      </div>
    );
  }

  const lines = hasRealLyrics(song)
    ? song.lyricsUntilChorus1.split("\n")
    : null;

  return (
    <div
      className="rounded-3xl border-2 border-yellow-400/40 flex flex-col animate-fade-in"
      style={{ background: "linear-gradient(160deg, rgba(0,0,0,0.7) 0%, rgba(88,28,135,0.35) 100%)" }}
    >
      {/* ── Song header ─────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
        <div>
          <p
            className="text-xs font-black uppercase tracking-[0.2em] mb-2"
            style={{ color: "#facc15", textShadow: "0 0 12px rgba(250,204,21,0.6)" }}
          >
            🎤 Du singst
          </p>
          <h2
            className="font-black text-2xl sm:text-3xl leading-tight text-white"
            style={{ textShadow: "0 2px 16px rgba(0,0,0,0.8)" }}
          >
            {song.title}
          </h2>
          <p className="text-yellow-300/80 font-bold text-base sm:text-lg mt-1">{song.artist}</p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0 mt-1">
          {round.titleFound && (
            <span className="bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">Titel ✓</span>
          )}
          {round.artistFound && (
            <span className="bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">Artist ✓</span>
          )}
        </div>
      </div>

      {/* ── Lyrics ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-h-[55vh] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {lines ? (
          <div className="space-y-1 text-center max-w-2xl mx-auto">
            {lines.map((line, i) => (
              line.trim() === "" ? (
                <div key={i} className="h-5" />
              ) : (
                <p
                  key={i}
                  className="font-black leading-tight text-white text-3xl sm:text-4xl lg:text-5xl"
                  style={{
                    textShadow: "0 0 30px rgba(250,204,21,0.25), 0 2px 8px rgba(0,0,0,0.9)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {line}
                </p>
              )
            ))}
          </div>
        ) : (
          <p className="text-white/30 italic text-lg text-center py-12">
            Lyrics noch nicht eingetragen.
          </p>
        )}
      </div>

      {/* ── Footer cue ──────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-t border-white/10 text-center">
        <p
          className="text-sm font-black uppercase tracking-widest"
          style={{ color: "#facc15", textShadow: "0 0 10px rgba(250,204,21,0.4)" }}
        >
          🎵 Singe jetzt — die anderen raten!
        </p>
      </div>
    </div>
  );
}

// ─── Spectator Card ───────────────────────────────────────────────────────────

function SpectatorCard({ genre, singerName, round }: {
  genre: string;
  singerName: string | null;
  round: NonNullable<PublicRoomData["currentRound"]>;
}) {
  const color = getGenreColor(genre);
  return (
    <div
      className="rounded-3xl p-8 flex flex-col items-center gap-6 min-h-56 border-2"
      style={{ backgroundColor: `${color}08`, borderColor: `${color}30` }}
    >
      {singerName && (
        <p className="text-white/50 text-sm">
          <span className="font-bold" style={{ color }}>{singerName}</span> singt gerade
        </p>
      )}

      {/* Big genre display */}
      <div className="text-center">
        <div className="text-6xl mb-3">{getGenreIcon(genre)}</div>
        <div
          className="rounded-2xl px-8 py-4 border"
          style={{ backgroundColor: `${color}18`, borderColor: `${color}40` }}
        >
          <p className="font-black text-3xl" style={{ color }}>{genre}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {round.titleFound && (
          <span className="bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-bold px-2 py-1 rounded-full">Titel erraten ✓</span>
        )}
        {round.artistFound && (
          <span className="bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold px-2 py-1 rounded-full">Artist erraten ✓</span>
        )}
      </div>

      <div className="text-center space-y-1">
        <p className="text-pink-200 font-bold text-lg">🎧 Höre zu und rate den Song!</p>
        <p className="text-white/30 text-sm">Tippe deinen Tipp unten im Chat ↓</p>
      </div>
    </div>
  );
}

// ─── Leaderboard Panel ────────────────────────────────────────────────────────

function LeaderboardPanel({ players, currentPlayer }: {
  players: PublicRoomData["players"];
  currentPlayer: string;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const medals = ["🥇", "🥈", "🥉"];
  const avatarColors = [
    "bg-purple-600", "bg-pink-600", "bg-indigo-600",
    "bg-rose-600", "bg-violet-600", "bg-fuchsia-600",
    "bg-sky-600", "bg-teal-600",
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏆</span>
        <h3 className="text-white font-black text-sm uppercase tracking-widest">Leaderboard</h3>
      </div>

      <ul className="space-y-2">
        {sorted.map((entry, i) => {
          const isMe = entry.name === currentPlayer;
          const colorIdx = players.findIndex(p => p.name === entry.name) % avatarColors.length;
          return (
            <li
              key={entry.name}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                isMe
                  ? "bg-yellow-400/10 border border-yellow-400/20"
                  : "bg-white/5 border border-transparent"
              }`}
            >
              {/* Rank / medal */}
              <span className="text-base w-6 text-center shrink-0">
                {medals[i] ?? <span className="text-white/30 text-sm font-bold">{i + 1}</span>}
              </span>

              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full ${avatarColors[colorIdx]} flex items-center justify-center text-white font-black text-xs shrink-0`}>
                {initials(entry.name)}
              </div>

              {/* Name + badges */}
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm truncate ${isMe ? "text-yellow-300" : "text-white"}`}>
                  {entry.name}
                </p>
                <div className="flex gap-1 mt-0.5">
                  {entry.isHost && <span className="text-yellow-400 text-xs">👑</span>}
                  {entry.isSinger && <span className="text-pink-400 text-xs">🎤</span>}
                  {isMe && <span className="text-white/30 text-xs">Du</span>}
                </div>
              </div>

              {/* Score */}
              <span className={`font-black tabular-nums text-sm shrink-0 ${isMe ? "text-yellow-400" : "text-white/70"}`}>
                {entry.score}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ messages, playerName, disabled, placeholder, onSend }: {
  messages: PublicRoomData["chat"];
  playerName: string;
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || disabled) return;
    onSend(text);
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-widest">
          💬 Chat {!disabled && <span className="text-pink-400">& Raten</span>}
        </p>
        {disabled && <span className="text-white/20 text-xs">Gesperrt</span>}
      </div>

      {/* Messages */}
      <div
        ref={chatRef}
        className="h-40 overflow-y-auto px-4 pb-2 space-y-1.5 scroll-smooth"
      >
        {messages.length === 0 && (
          <p className="text-white/20 text-xs text-center pt-6">Noch keine Nachrichten…</p>
        )}
        {messages.map((msg) =>
          msg.isSystem ? (
            <div key={msg.id} className="flex justify-center">
              <span className="inline-block bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-white/50 text-xs italic">
                {msg.text}
              </span>
            </div>
          ) : (
            <div key={msg.id} className={`flex gap-2 ${msg.sender === playerName ? "flex-row-reverse" : "flex-row"}`}>
              <div
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black ${
                  msg.sender === playerName ? "bg-pink-600" : "bg-purple-700"
                }`}
              >
                {msg.sender.slice(0, 1).toUpperCase()}
              </div>
              <div className={`flex flex-col gap-0.5 max-w-[75%] ${msg.sender === playerName ? "items-end" : "items-start"}`}>
                <span className="text-white/30 text-xs px-1">{msg.sender !== playerName && msg.sender} {msg.time}</span>
                <div
                  className={`rounded-2xl px-3 py-1.5 text-sm leading-snug ${
                    msg.sender === playerName
                      ? "bg-pink-600/40 border border-pink-500/30 text-white"
                      : "bg-white/10 border border-white/10 text-white/90"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-3 pt-2 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={100}
          className="flex-1 bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-white text-sm placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition disabled:opacity-30 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="bg-pink-600 hover:bg-pink-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-2 text-sm transition-all active:scale-95 shrink-0"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// ─── Final Ranking Screen ─────────────────────────────────────────────────────

function FinalRankingScreen({ players, isHost, onResetToLobby, onStartNewGame, onLeave }: {
  players: PublicRoomData["players"];
  isHost: boolean;
  onResetToLobby: () => void;
  onStartNewGame: () => void;
  onLeave: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const first  = sorted[0] ?? null;
  const second = sorted[1] ?? null;
  const third  = sorted[2] ?? null;

  const [showTitle,   setShowTitle]   = useState(false);
  const [showThird,   setShowThird]   = useState(false);
  const [showSecond,  setShowSecond]  = useState(false);
  const [showFirst,   setShowFirst]   = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];

    // t=0: title fades in
    setShowTitle(true);

    // t=800: podium reveal sound + 3rd place
    ts.push(setTimeout(() => {
      soundManager.play("winnerPodiumReveal");
      if (third)  setShowThird(true);
      else        setShowSecond(true); // skip if <3 players

      // t=800+900: 2nd place
      ts.push(setTimeout(() => {
        setShowSecond(true);

        // t=800+900+1100: 1st place + applause
        ts.push(setTimeout(() => {
          setShowFirst(true);
          ts.push(setTimeout(() => soundManager.play("winnerApplause"), 300));

          // t=..+1400: full ranking
          ts.push(setTimeout(() => {
            setShowRanking(true);
            // t=..+600: buttons
            ts.push(setTimeout(() => setShowActions(true), 600));
          }, 1400));
        }, 1100));
      }, third ? 900 : 0));
    }, 800));

    return () => ts.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layout: 2nd left | 1st center | 3rd right
  const podiumSlots: Array<{
    entry: typeof first;
    rank: number;
    medal: string;
    color: string;
    gradientFrom: string;
    gradientTo: string;
    blockHeight: number;
    nameSize: string;
    show: boolean;
  }> = [
    {
      entry: second, rank: 2, medal: "🥈",
      color: "#94a3b8", gradientFrom: "#94a3b8", gradientTo: "#64748b",
      blockHeight: 96, nameSize: "1rem",
      show: showSecond,
    },
    {
      entry: first,  rank: 1, medal: "🥇",
      color: "#facc15", gradientFrom: "#fbbf24", gradientTo: "#d97706",
      blockHeight: 144, nameSize: "1.3rem",
      show: showFirst,
    },
    {
      entry: third,  rank: 3, medal: "🥉",
      color: "#d97706", gradientFrom: "#d97706", gradientTo: "#92400e",
      blockHeight: 64, nameSize: "0.9rem",
      show: showThird,
    },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-purple-950 to-slate-950 flex flex-col items-center justify-center p-6 text-center overflow-hidden">

      {/* Title */}
      <div
        className="mb-10"
        style={{
          transition: "opacity 700ms, transform 700ms",
          opacity: showTitle ? 1 : 0,
          transform: showTitle ? "translateY(0)" : "translateY(-28px)",
        }}
      >
        <div className="text-7xl mb-3">🏆</div>
        <h1 className="text-5xl font-black text-white tracking-tight">
          Final <span className="text-yellow-400">Ranking</span>
        </h1>
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-5 mb-10" style={{ minHeight: 220 }}>
        {podiumSlots.map(({ entry, rank, medal, color, gradientFrom, gradientTo, blockHeight, nameSize, show }) => {
          const isFirst = rank === 1;
          if (!entry) return <div key={rank} style={{ width: isFirst ? 144 : 112 }} />;
          return (
            <div
              key={rank}
              className="flex flex-col items-center gap-1.5"
              style={{
                width: isFirst ? 144 : 112,
                transition: "opacity 600ms cubic-bezier(0.34,1.56,0.64,1), transform 600ms cubic-bezier(0.34,1.56,0.64,1)",
                opacity: show ? 1 : 0,
                transform: show ? "translateY(0) scale(1)" : "translateY(48px) scale(0.75)",
              }}
            >
              <span style={{ fontSize: isFirst ? "2.5rem" : "1.8rem" }}>{medal}</span>
              <p
                className="font-black truncate w-full text-center leading-tight"
                style={{ color, fontSize: nameSize }}
              >
                {entry.name}
              </p>
              <p className="font-bold tabular-nums" style={{ color: `${color}99`, fontSize: "0.75rem" }}>
                {entry.score} Pkt
              </p>
              {/* Podium block */}
              <div
                className="w-full rounded-t-2xl flex items-end justify-center pb-3 shadow-2xl"
                style={{
                  height: blockHeight,
                  background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})`,
                  boxShadow: `0 8px 32px ${gradientFrom}55`,
                }}
              >
                <span className="text-white/90 font-black text-2xl">{rank}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full ranking list */}
      <div
        className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl overflow-hidden mb-6"
        style={{
          transition: "opacity 700ms, transform 700ms",
          opacity: showRanking ? 1 : 0,
          transform: showRanking ? "translateY(0)" : "translateY(20px)",
        }}
      >
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-white/40 text-xs uppercase tracking-widest font-semibold">Endstand</p>
        </div>
        <ul className="divide-y divide-white/5">
          {sorted.map((entry, i) => (
            <li key={entry.name} className="flex items-center gap-3 px-4 py-3">
              <span className="text-base w-7 text-center shrink-0">
                {(["🥇", "🥈", "🥉"] as const)[i] ?? `${i + 1}.`}
              </span>
              <span className="flex-1 text-white font-semibold text-sm truncate">{entry.name}</span>
              <span className="text-yellow-400 font-black tabular-nums">{entry.score}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Action buttons */}
      <div
        className="flex flex-col gap-3 w-full max-w-sm"
        style={{
          transition: "opacity 500ms, transform 500ms",
          opacity: showActions ? 1 : 0,
          transform: showActions ? "translateY(0)" : "translateY(16px)",
          pointerEvents: showActions ? "auto" : "none",
        }}
      >
        {isHost ? (
          <>
            <button
              onClick={() => { soundManager.play("click"); onStartNewGame(); }}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-purple-950 font-black text-lg rounded-2xl py-4 transition-all active:scale-95 shadow-xl shadow-yellow-400/20"
            >
              🎮 Nochmal spielen
            </button>
            <button
              onClick={() => { soundManager.play("click"); onResetToLobby(); }}
              className="w-full bg-white/10 hover:bg-white/15 text-white font-semibold rounded-2xl py-3 transition-all active:scale-95"
            >
              🏠 Zurück zur Lobby
            </button>
            <button
              onClick={() => { soundManager.play("click"); onLeave(); }}
              className="text-white/30 hover:text-white font-semibold py-2 text-sm transition"
            >
              ← Raum verlassen
            </button>
          </>
        ) : (
          <>
            <div className="bg-white/5 border border-white/10 rounded-2xl py-4 px-6">
              <p className="text-white/40 font-semibold animate-pulse">⏳ Warte auf Host…</p>
            </div>
            <button
              onClick={() => { soundManager.play("click"); onLeave(); }}
              className="text-white/30 hover:text-white font-semibold py-2 text-sm transition"
            >
              ← Raum verlassen
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Round Summary Overlay ────────────────────────────────────────────────────

function RoundSummaryOverlay({ song, roundDeltas, titleGuessers, artistGuessers, players, isHost, isLastRound, onNextRound }: {
  song: Song;
  roundDeltas: Record<string, number>;
  titleGuessers: string[];
  artistGuessers: string[];
  players: PublicRoomData["players"];
  isHost: boolean;
  isLastRound: boolean;
  onNextRound: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-white/20 rounded-3xl shadow-2xl overflow-hidden my-4">
        {/* Header */}
        <div className="bg-linear-to-r from-purple-900 to-pink-900 px-6 py-5 text-center border-b border-white/10">
          <div className="text-4xl mb-2">🎶</div>
          <h2 className="text-white font-black text-2xl">Runde beendet!</h2>
          <p className="text-white/50 text-sm mt-1">Der Song war:</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Song reveal */}
          <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-4 text-center">
            <p className="text-yellow-400 font-black text-2xl leading-tight">{song.title}</p>
            <p className="text-pink-300 font-semibold mt-1">{song.artist}</p>
            <div className="mt-2 flex justify-center">
              <span
                className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border"
                style={{
                  color: getGenreColor(song.genre),
                  backgroundColor: `${getGenreColor(song.genre)}20`,
                  borderColor: `${getGenreColor(song.genre)}40`,
                }}
              >
                {getGenreIcon(song.genre)} {song.genre}
              </span>
            </div>
          </div>

          {/* Who guessed what */}
          {(titleGuessers.length > 0 || artistGuessers.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">🎯 Titel erkannt</p>
                {titleGuessers.length > 0 ? (
                  <ul className="space-y-1">
                    {titleGuessers.map((name) => (
                      <li key={name} className="text-white text-sm font-semibold truncate">{name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-white/30 text-xs italic">Niemand</p>
                )}
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-2">🎵 Interpret erkannt</p>
                {artistGuessers.length > 0 ? (
                  <ul className="space-y-1">
                    {artistGuessers.map((name) => (
                      <li key={name} className="text-white text-sm font-semibold truncate">{name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-white/30 text-xs italic">Niemand</p>
                )}
              </div>
            </div>
          )}

          {/* YouTube video */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-widest mb-3 font-semibold">
              🎬 Now Playing
            </p>
            <YouTubeEmbed
              videoId={song.youtubeVideoId ?? ""}
              startSeconds={song.chorusDropSeconds ?? 0}
            />
          </div>

          {/* Scores */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-widest mb-3 font-semibold">
              Punkte diese Runde
            </p>
            <ul className="space-y-2">
              {sorted.map((entry, i) => {
                const delta = roundDeltas[entry.name] ?? 0;
                const gotTitle  = titleGuessers.includes(entry.name);
                const gotArtist = artistGuessers.includes(entry.name);
                return (
                  <li key={entry.name} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5">
                    <span className="text-base shrink-0">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                    <span className="flex-1 text-white font-semibold text-sm truncate">{entry.name}</span>
                    <div className="flex items-center gap-1.5">
                      {gotTitle  && <span className="text-green-400 text-xs font-bold bg-green-500/15 px-1.5 py-0.5 rounded-md">T</span>}
                      {gotArtist && <span className="text-blue-400 text-xs font-bold bg-blue-500/15 px-1.5 py-0.5 rounded-md">A</span>}
                    </div>
                    {delta > 0 && (
                      <span className="text-green-400 text-sm font-bold">+{delta}</span>
                    )}
                    <span className="text-yellow-400 font-black tabular-nums">{entry.score}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Action */}
          {isHost ? (
            <button
              onClick={onNextRound}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-purple-950 font-black text-xl rounded-2xl py-4 transition-all active:scale-95 shadow-xl shadow-yellow-400/20"
            >
              {isLastRound ? "🏆 Ergebnisse anzeigen" : "🎲 Nächste Runde"}
            </button>
          ) : (
            <div className="text-center py-3">
              <p className="text-white/40 font-semibold animate-pulse">⏳ Warte auf Host…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
