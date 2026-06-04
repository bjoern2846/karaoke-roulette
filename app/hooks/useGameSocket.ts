"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "../lib/socket";
import { soundManager } from "../lib/soundManager";
import type { PublicRoomData, RoundEndData } from "../types/game";

export type Screen = "home" | "lobby" | "game";

const RECONNECT_KEY = "karaoke_reconnect";

function saveReconnectSession(playerName: string, roomCode: string) {
  try { localStorage.setItem(RECONNECT_KEY, JSON.stringify({ playerName, roomCode })); } catch {}
}
function loadReconnectSession(): { playerName: string; roomCode: string } | null {
  try {
    const s = localStorage.getItem(RECONNECT_KEY);
    return s ? (JSON.parse(s) as { playerName: string; roomCode: string }) : null;
  } catch { return null; }
}
function clearReconnectSession() {
  try { localStorage.removeItem(RECONNECT_KEY); } catch {}
}

export interface UseGameSocketReturn {
  screen: Screen;
  playerName: string;
  room: PublicRoomData | null;
  timeLeft: number;
  roundEndData: RoundEndData | null;
  error: string | null;
  isConnected: boolean;
  createRoom: (name: string) => void;
  joinRoom: (name: string, code: string) => void;
  startGame: () => void;
  spinGenre: () => void;
  sendMessage: (text: string) => void;
  nextRound: () => void;
  setTotalRounds: (total: number) => void;
  resetToLobby: () => void;
  startNewGame: () => void;
  leaveRoom: () => void;
  clearError: () => void;
  resetSongHistory: () => void;
  setGameMode: (mode: "online" | "local") => void;
  buzz: (type: "title" | "artist") => void;
  judgeBuzz: (type: "title" | "artist", correct: boolean) => void;
}

export function useGameSocket(): UseGameSocketReturn {
  const [screen, setScreen] = useState<Screen>("home");
  const [playerName, setPlayerName] = useState("");
  const [room, setRoom] = useState<PublicRoomData | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [roundEndData, setRoundEndData] = useState<RoundEndData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs so event handlers always see current values without re-registering
  const roomRef = useRef<PublicRoomData | null>(null);
  const screenRef = useRef<Screen>("home");
  const playerNameRef = useRef<string>("");

  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);

  useEffect(() => {
    const socket = getSocket();

    function onConnect() {
      setIsConnected(true);
      // On reconnect (not initial connect when we're already in a room), attempt to rejoin
      if (screenRef.current === "home") {
        const saved = loadReconnectSession();
        if (saved) {
          socket.emit("reconnectRoom", { playerName: saved.playerName, roomCode: saved.roomCode });
        }
      }
    }

    function onDisconnect() { setIsConnected(false); }

    function onRoomUpdated(data: PublicRoomData) {
      console.log("[roomUpdated] gameMode=", data.gameMode, "phase=", data.phase);
      setRoom(data);

      if (!data.currentRound || data.currentRound.phase !== "ended") {
        setRoundEndData(null);
      }

      if (data.currentRound?.timeLeft !== undefined) {
        setTimeLeft(data.currentRound.timeLeft);
      } else if (!data.currentRound) {
        setTimeLeft(60);
      }

      if (data.phase === "lobby") setScreen("lobby");
      if (data.phase === "game" || data.phase === "gameEnded") setScreen("game");
    }

    function onTimerTick(t: number) { setTimeLeft(t); }

    function onRoundEnded(data: RoundEndData) { setRoundEndData(data); }

    function onError(msg: string) { setError(msg); }

    function onKicked() {
      clearReconnectSession();
      setRoom(null);
      setScreen("home");
      setRoundEndData(null);
    }

    function onYourGuessCorrect() {
      soundManager.play("correctGuess");
    }

    function onReconnectSuccess(data: PublicRoomData) {
      const saved = loadReconnectSession();
      if (saved) setPlayerName(saved.playerName);
      setRoom(data);
      setRoundEndData(null);
      if (data.phase === "lobby") setScreen("lobby");
      if (data.phase === "game" || data.phase === "gameEnded") setScreen("game");
    }

    function onReconnectFailed() {
      clearReconnectSession();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("roomUpdated", onRoomUpdated);
    socket.on("timerTick", onTimerTick);
    socket.on("roundEnded", onRoundEnded);
    socket.on("error", onError);
    socket.on("kicked", onKicked);
    socket.on("yourGuessCorrect", onYourGuessCorrect);
    socket.on("reconnectSuccess", onReconnectSuccess);
    socket.on("reconnectFailed", onReconnectFailed);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("roomUpdated", onRoomUpdated);
      socket.off("timerTick", onTimerTick);
      socket.off("roundEnded", onRoundEnded);
      socket.off("error", onError);
      socket.off("kicked", onKicked);
      socket.off("yourGuessCorrect", onYourGuessCorrect);
      socket.off("reconnectSuccess", onReconnectSuccess);
      socket.off("reconnectFailed", onReconnectFailed);
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    const socket = getSocket();
    setPlayerName(name);
    socket.emit("createRoom", name, (res: { room?: PublicRoomData; error?: string }) => {
      if (res.error) { setError(res.error); return; }
      if (res.room) {
        saveReconnectSession(name, res.room.code);
        setRoom(res.room);
        setScreen("lobby");
      }
    });
  }, []);

  const joinRoom = useCallback((name: string, code: string) => {
    const socket = getSocket();
    setPlayerName(name);
    socket.emit(
      "joinRoom",
      { playerName: name, roomCode: code },
      (res: { room?: PublicRoomData; error?: string }) => {
        if (res.error) { setError(res.error); return; }
        if (res.room) {
          saveReconnectSession(name, res.room.code);
          setRoom(res.room);
          setScreen("lobby");
        }
      }
    );
  }, []);

  const startGame = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("startGame", r.code);
  }, []);

  const spinGenre = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("spinGenre", r.code);
  }, []);

  const sendMessage = useCallback((text: string) => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("sendMessage", { roomCode: r.code, text });
  }, []);

  const nextRound = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    setRoundEndData(null);
    getSocket().emit("nextRound", r.code);
  }, []);

  const setTotalRounds = useCallback((total: number) => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("setTotalRounds", { code: r.code, total });
  }, []);

  const resetToLobby = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    setRoundEndData(null);
    getSocket().emit("resetToLobby", r.code);
  }, []);

  const startNewGame = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    setRoundEndData(null);
    getSocket().emit("startNewGame", r.code);
  }, []);

  const leaveRoom = useCallback(() => {
    const r = roomRef.current;
    if (r) getSocket().emit("leaveRoom", r.code);
    clearReconnectSession();
    setRoom(null);
    setScreen("home");
    setRoundEndData(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const resetSongHistory = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("resetSongHistory", r.code);
  }, []);

  const setGameMode = useCallback((mode: "online" | "local") => {
    const r = roomRef.current;
    if (!r) { console.warn("[setGameMode] no room ref"); return; }
    const payload = { code: r.code, mode };
    console.log("[setGameMode] emit", payload);
    getSocket().emit("setGameMode", payload, (res: { ok?: boolean; error?: string }) => {
      console.log("[setGameMode] ack", res);
      if (res?.error) setError(res.error);
    });
  }, []);

  const buzz = useCallback((type: "title" | "artist") => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("buzz", { roomCode: r.code, type });
  }, []);

  const judgeBuzz = useCallback((type: "title" | "artist", correct: boolean) => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("judgeBuzz", { roomCode: r.code, type, correct });
  }, []);

  return {
    screen, playerName, room, timeLeft, roundEndData, error, isConnected,
    createRoom, joinRoom, startGame, spinGenre, sendMessage, nextRound,
    setTotalRounds, resetToLobby, startNewGame, leaveRoom, clearError,
    resetSongHistory, setGameMode, buzz, judgeBuzz,
  };
}
