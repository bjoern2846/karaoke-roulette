// ─── Genre type ───────────────────────────────────────────────────────────────

export type Genre =
  | "Pop"
  | "Rock"
  | "Hip-Hop / Rap"
  | "2000er"
  | "2010er"
  | "80er"
  | "90er"
  | "Party Hits"
  | "One Hit Wonders"
  | "Deutsche Schlager";

export const GENRES: Genre[] = [
  "Pop",
  "Rock",
  "Hip-Hop / Rap",
  "2000er",
  "2010er",
  "80er",
  "90er",
  "Party Hits",
  "One Hit Wonders",
  "Deutsche Schlager",
];

// ─── Colors (hex, for inline styles) ─────────────────────────────────────────

export const GENRE_COLORS: Record<Genre, string> = {
  "Pop":              "#ec4899",
  "Rock":             "#ef4444",
  "Hip-Hop / Rap":    "#8b5cf6",
  "2000er":           "#3b82f6",
  "2010er":           "#06b6d4",
  "80er":             "#f59e0b",
  "90er":             "#10b981",
  "Party Hits":       "#f97316",
  "One Hit Wonders":  "#a855f7",
  "Deutsche Schlager":"#14b8a6",
};

// ─── Icons ────────────────────────────────────────────────────────────────────

export const GENRE_ICONS: Record<Genre, string> = {
  "Pop":              "🎵",
  "Rock":             "🎸",
  "Hip-Hop / Rap":    "🎤",
  "2000er":           "📼",
  "2010er":           "📱",
  "80er":             "🕹️",
  "90er":             "💿",
  "Party Hits":       "🎉",
  "One Hit Wonders":  "⭐",
  "Deutsche Schlager":"🌸",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FALLBACK_COLOR = "#8b5cf6";
const FALLBACK_ICON  = "🎵";

export function getGenreColor(genre: string): string {
  return GENRE_COLORS[genre as Genre] ?? FALLBACK_COLOR;
}

export function getGenreIcon(genre: string): string {
  return GENRE_ICONS[genre as Genre] ?? FALLBACK_ICON;
}
