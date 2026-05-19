import songsData from "./songs.json";
import type { Genre } from "../constants/genres";
export type { Genre } from "../constants/genres";
export { GENRES, getGenreColor, getGenreIcon } from "../constants/genres";

export interface Song {
  id: string;
  title: string;
  artist: string;
  genre: Genre;
  /** Set to LYRICS_PLACEHOLDER if lyrics not yet entered privately. */
  lyricsUntilChorus1: string;
  youtubeVideoId: string;
  chorusDropSeconds: number;
  revealDurationSeconds: number;
  titleAliases: string[];
  artistAliases: string[];
}

// ─── Sentinel ─────────────────────────────────────────────────────────────────

export const LYRICS_PLACEHOLDER = "[PRIVATE_LYRICS_GO_HERE]";

export function hasRealLyrics(song: Song): boolean {
  const v = song.lyricsUntilChorus1?.trim();
  return !!v && v !== LYRICS_PLACEHOLDER;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export function loadSongs(): Song[] {
  return songsData as Song[];
}

export const SONGS: Song[] = loadSongs();

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getSongsByGenre(genre: Genre): Song[] {
  return SONGS.filter((s) => s.genre === genre);
}

export function getRandomSongByGenre(genre: Genre, excludeId?: string): Song | null {
  let pool = getSongsByGenre(genre).filter((s) => s.id !== excludeId);
  if (!pool.length) pool = getSongsByGenre(genre); // fallback: allow repeat if only one song
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** @deprecated Use getRandomSongByGenre */
export function getRandomSong(genre: Genre): Song | null {
  return getRandomSongByGenre(genre);
}

// ─── Guess matching ───────────────────────────────────────────────────────────

export function normalizeGuess(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function anyMatch(guess: string, candidates: string[]): boolean {
  const g = normalizeGuess(guess);
  return candidates.some((c) => {
    const n = normalizeGuess(c);
    return n.length > 0 && g.includes(n);
  });
}

export function matchesTitle(guess: string, song: Song): boolean {
  return anyMatch(guess, [song.title, ...song.titleAliases]);
}

export function matchesArtist(guess: string, song: Song): boolean {
  return anyMatch(guess, [song.artist, ...song.artistAliases]);
}
