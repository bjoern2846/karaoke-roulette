import type { Song, Genre } from "../data/songs";
export type { Song, Genre };

export interface PublicBuzzerSlot {
  lockedByPlayerName?: string;
  solvedByPlayerName?: string;
  iAmRejected: boolean;
}

export interface PublicLocalBuzzerState {
  title: PublicBuzzerSlot;
  artist: PublicBuzzerSlot;
}

export interface PublicPlayer {
  name: string;
  isHost: boolean;
  score: number;
  isSinger: boolean;
  disconnected: boolean;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  isSystem: boolean;
}

export interface PublicRound {
  /** null during "spinning" phase — genre is hidden until reveal */
  genre: Genre | null;
  phase: "spinning" | "revealing" | "playing" | "ended";
  timeLeft: number;
  titleFound: boolean;
  artistFound: boolean;
  titleGuessers: string[];
  artistGuessers: string[];
  /** Non-null only for the current singer */
  song: Song | null;
  roundDeltas: Record<string, number>;
  /** Non-null only in local mode */
  localBuzzerState: PublicLocalBuzzerState | null;
}

export interface PublicRoomData {
  code: string;
  players: PublicPlayer[];
  phase: "lobby" | "game" | "gameEnded";
  singerName: string | null;
  chat: ChatMessage[];
  currentRound: PublicRound | null;
  totalRounds: number;
  currentRoundNumber: number;
  playedSongsCount: number;
  totalSongsCount: number;
  gameMode: "online" | "local";
}

export interface RoundEndData {
  song: Song;
  roundDeltas: Record<string, number>;
  titleGuessers: string[];
  artistGuessers: string[];
  gameMode: "online" | "local";
}
