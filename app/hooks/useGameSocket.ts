"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "../lib/socket";
import type { PublicRoomData, RoundEndData } from "../types/game";

export type Screen = "home" | "lobby" | "game";

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
}

export function useGameSocket(): UseGameSocketReturn {
  const [screen, setScreen] = useState<Screen>("home");
  const [playerName, setPlayerName] = useState("");
  const [room, setRoom] = useState<PublicRoomData | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [roundEndData, setRoundEndData] = useState<RoundEndData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Keep room in a ref so callbacks always see current value
  const roomRef = useRef<PublicRoomData | null>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    const socket = getSocket();

    function onConnect() { setIsConnected(true); }
    function onDisconnect() { setIsConnected(false); }

    function onRoomUpdated(data: PublicRoomData) {
      setRoom(data);

      // Server is single source of truth for round lifecycle.
      // Clear the local round-end summary whenever the server signals:
      //   - no active round (currentRound === null → after nextRound)
      //   - round is playing (new spin → overlay must go away)
      // Only keep the summary while currentRound.phase === "ended".
      if (!data.currentRound || data.currentRound.phase !== "ended") {
        setRoundEndData(null);
      }

      if (data.currentRound?.timeLeft !== undefined) {
        setTimeLeft(data.currentRound.timeLeft);
      } else if (!data.currentRound) {
        setTimeLeft(60); // reset display to default between rounds
      }

      if (data.phase === "lobby") setScreen("lobby");
      if (data.phase === "game" || data.phase === "gameEnded") setScreen("game");
    }

    function onTimerTick(t: number) {
      setTimeLeft(t);
    }

    function onRoundEnded(data: RoundEndData) {
      setRoundEndData(data);
    }

    function onError(msg: string) {
      setError(msg);
    }

    function onKicked() {
      setRoom(null);
      setScreen("home");
      setRoundEndData(null);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("roomUpdated", onRoomUpdated);
    socket.on("timerTick", onTimerTick);
    socket.on("roundEnded", onRoundEnded);
    socket.on("error", onError);
    socket.on("kicked", onKicked);

    // Sync initial connection state
    if (socket.connected) setIsConnected(true);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("roomUpdated", onRoomUpdated);
      socket.off("timerTick", onTimerTick);
      socket.off("roundEnded", onRoundEnded);
      socket.off("error", onError);
      socket.off("kicked", onKicked);
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    const socket = getSocket();
    setPlayerName(name);
    socket.emit("createRoom", name, (res: { room?: PublicRoomData; error?: string }) => {
      if (res.error) { setError(res.error); return; }
      if (res.room) {
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
    setRoom(null);
    setScreen("home");
    setRoundEndData(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    screen, playerName, room, timeLeft, roundEndData, error, isConnected,
    createRoom, joinRoom, startGame, spinGenre, sendMessage, nextRound,
    setTotalRounds, resetToLobby, startNewGame, leaveRoom, clearError,
  };
}
