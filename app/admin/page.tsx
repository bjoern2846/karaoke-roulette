"use client";

import { useState, useEffect, useCallback } from "react";
import type { Song } from "../data/songs";
import { GENRES, getGenreColor, getGenreIcon } from "../constants/genres";
import type { Genre } from "../constants/genres";

const PLACEHOLDER = "[PRIVATE_LYRICS_GO_HERE]";

const EMPTY_FORM: Omit<Song, "id"> = {
  title: "",
  artist: "",
  genre: "Pop",
  lyricsUntilChorus1: PLACEHOLDER,
  youtubeVideoId: "",
  chorusDropSeconds: 30,
  revealDurationSeconds: 60,
  titleAliases: [],
  artistAliases: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitAliases(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function joinAliases(arr: string[]): string {
  return arr.join(", ");
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Song | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/songs");
    setSongs(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showFlash(type: "ok" | "err", msg: string) {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 3000);
  }

  function openNew() {
    setEditing({ id: "", ...EMPTY_FORM });
    setIsNew(true);
  }

  function openEdit(song: Song) {
    setEditing({ ...song });
    setIsNew(false);
  }

  function cancelEdit() {
    setEditing(null);
    setIsNew(false);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      if (isNew) {
        const { id: _id, ...body } = editing;
        const res = await fetch("/api/admin/songs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch(`/api/admin/songs/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      await load();
      setEditing(null);
      setIsNew(false);
      showFlash("ok", isNew ? "Song hinzugefügt!" : "Song gespeichert!");
    } catch (e) {
      showFlash("err", String(e));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id: string) {
    const res = await fetch(`/api/admin/songs/${id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      showFlash("ok", "Song gelöscht.");
    } else {
      showFlash("err", "Fehler beim Löschen.");
    }
    setDeleteId(null);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-black/70 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <a href="/" className="text-white/40 hover:text-white text-sm transition">← Zurück</a>
        <h1 className="text-white font-black text-xl flex-1">
          🎤 Song-Verwaltung
        </h1>
        <span className="text-white/30 text-sm">{songs.length} Songs</span>
        <button
          onClick={openNew}
          className="bg-yellow-400 hover:bg-yellow-300 text-purple-950 font-black text-sm rounded-xl px-4 py-2 transition-all active:scale-95"
        >
          + Song hinzufügen
        </button>
      </header>

      {/* Flash */}
      {flash && (
        <div
          className={`mx-6 mt-4 rounded-xl px-4 py-3 text-sm font-semibold border ${
            flash.type === "ok"
              ? "bg-green-500/20 border-green-500/30 text-green-300"
              : "bg-red-500/20 border-red-500/30 text-red-300"
          }`}
        >
          {flash.type === "ok" ? "✅" : "⚠️"} {flash.msg}
        </div>
      )}

      <div className="p-6">
        {loading ? (
          <p className="text-white/30 text-center py-20 animate-pulse">Lade Songs…</p>
        ) : songs.length === 0 ? (
          <p className="text-white/30 text-center py-20">Noch keine Songs. Füge einen hinzu!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs uppercase tracking-widest border-b border-white/10">
                  <th className="text-left py-3 pr-4 font-semibold">Titel</th>
                  <th className="text-left py-3 pr-4 font-semibold">Artist</th>
                  <th className="text-left py-3 pr-4 font-semibold">Genre</th>
                  <th className="text-left py-3 pr-4 font-semibold">YouTube</th>
                  <th className="text-left py-3 pr-4 font-semibold">Start</th>
                  <th className="text-left py-3 pr-4 font-semibold">Lyrics</th>
                  <th className="py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {songs.map((song) => {
                  const color = getGenreColor(song.genre);
                  const hasLyrics =
                    !!song.lyricsUntilChorus1?.trim() &&
                    song.lyricsUntilChorus1 !== PLACEHOLDER;
                  return (
                    <tr key={song.id} className="hover:bg-white/3 transition group">
                      <td className="py-3 pr-4 font-semibold text-white">{song.title}</td>
                      <td className="py-3 pr-4 text-white/70">{song.artist}</td>
                      <td className="py-3 pr-4">
                        <span
                          className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border"
                          style={{
                            color,
                            backgroundColor: `${color}20`,
                            borderColor: `${color}40`,
                          }}
                        >
                          {getGenreIcon(song.genre)} {song.genre}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-white/50 text-xs">
                        {song.youtubeVideoId || <span className="text-red-400/70">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-white/50 text-xs">
                        {song.chorusDropSeconds}s
                      </td>
                      <td className="py-3 pr-4">
                        {hasLyrics ? (
                          <span className="text-green-400 text-xs font-bold">✓ eingetragen</span>
                        ) : (
                          <span className="text-white/25 text-xs">— fehlt</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => openEdit(song)}
                            className="text-white/50 hover:text-white text-xs font-semibold bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition"
                          >
                            ✏️ Bearbeiten
                          </button>
                          <button
                            onClick={() => setDeleteId(song.id)}
                            className="text-red-400/70 hover:text-red-300 text-xs font-semibold bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition"
                          >
                            🗑️ Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Add modal */}
      {editing && (
        <SongModal
          song={editing}
          isNew={isNew}
          saving={saving}
          onChange={(patch) => setEditing((prev) => prev ? { ...prev, ...patch } : prev)}
          onSave={save}
          onCancel={cancelEdit}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm text-center space-y-4">
            <p className="text-white font-bold text-lg">Song löschen?</p>
            <p className="text-white/40 text-sm">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl py-2.5 transition"
              >
                Abbrechen
              </button>
              <button
                onClick={() => confirmDelete(deleteId)}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl py-2.5 transition"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT =
  "w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition";

// ─── Song Modal ───────────────────────────────────────────────────────────────

function SongModal({
  song, isNew, saving, onChange, onSave, onCancel,
}: {
  song: Song;
  isNew: boolean;
  saving: boolean;
  onChange: (patch: Partial<Song>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const color = getGenreColor(song.genre);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-2xl my-8">
        {/* Header */}
        <div
          className="px-6 py-5 rounded-t-3xl border-b border-white/10 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${color}20, transparent)` }}
        >
          <h2 className="text-white font-black text-xl">
            {isNew ? "➕ Neuer Song" : "✏️ Song bearbeiten"}
          </h2>
          <button onClick={onCancel} className="text-white/30 hover:text-white text-xl transition">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Row: title + artist */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Titel *">
              <input
                value={song.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="z.B. Blinding Lights"
                className={INPUT}
              />
            </Field>
            <Field label="Artist *">
              <input
                value={song.artist}
                onChange={(e) => onChange({ artist: e.target.value })}
                placeholder="z.B. The Weeknd"
                className={INPUT}
              />
            </Field>
          </div>

          {/* Row: genre */}
          <Field label="Genre *">
            <select
              value={song.genre}
              onChange={(e) => onChange({ genre: e.target.value as Genre })}
              className={INPUT}
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>{getGenreIcon(g)} {g}</option>
              ))}
            </select>
          </Field>

          {/* Row: youtube + timing */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <Field label="YouTube Video-ID">
                <input
                  value={song.youtubeVideoId}
                  onChange={(e) => onChange({ youtubeVideoId: e.target.value.trim() })}
                  placeholder="xxxxxxxxxxx"
                  className={`${INPUT} font-mono`}
                />
              </Field>
            </div>
            <Field label="Chorus-Start (Sekunden)">
              <input
                type="number"
                min={0}
                value={song.chorusDropSeconds}
                onChange={(e) => onChange({ chorusDropSeconds: Number(e.target.value) })}
                className={INPUT}
              />
            </Field>
            <Field label="Reveal-Dauer (Sekunden)">
              <input
                type="number"
                min={10}
                value={song.revealDurationSeconds}
                onChange={(e) => onChange({ revealDurationSeconds: Number(e.target.value) })}
                className={INPUT}
              />
            </Field>
          </div>

          {/* Lyrics */}
          <Field label="Lyrics bis Chorus 1">
            <textarea
              rows={8}
              value={song.lyricsUntilChorus1}
              onChange={(e) => onChange({ lyricsUntilChorus1: e.target.value })}
              placeholder={PLACEHOLDER}
              className={`${INPUT} font-mono text-sm resize-y`}
            />
            <p className="text-white/25 text-xs mt-1">
              Lass leer oder nutze <code className="text-white/40">{PLACEHOLDER}</code> falls noch keine Lyrics eingetragen.
            </p>
          </Field>

          {/* Aliases */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Titel-Aliases (kommagetrennt)">
              <input
                value={joinAliases(song.titleAliases)}
                onChange={(e) => onChange({ titleAliases: splitAliases(e.target.value) })}
                placeholder="z.B. Blinding Light"
                className={INPUT}
              />
            </Field>
            <Field label="Artist-Aliases (kommagetrennt)">
              <input
                value={joinAliases(song.artistAliases)}
                onChange={(e) => onChange({ artistAliases: splitAliases(e.target.value) })}
                placeholder="z.B. Weeknd"
                className={INPUT}
              />
            </Field>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-semibold rounded-xl py-3 transition"
            >
              Abbrechen
            </button>
            <button
              onClick={onSave}
              disabled={saving || !song.title.trim() || !song.artist.trim()}
              className="flex-1 font-black text-white rounded-xl py-3 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: color, boxShadow: `0 4px 20px ${color}40` }}
            >
              {saving ? "Speichern…" : isNew ? "Song hinzufügen" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-white/40 text-xs uppercase tracking-widest font-semibold">{label}</label>
      {children}
    </div>
  );
}
