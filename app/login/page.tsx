"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Falsches Passwort.");
        setPassword("");
      }
    } catch {
      setError("Verbindungsfehler. Bitte nochmal versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-purple-900 via-pink-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🔒</div>
          <h1 className="text-4xl font-black text-white tracking-tight drop-shadow-lg">
            Karaoke<span className="text-yellow-400"> Roulette</span>
          </h1>
          <p className="mt-2 text-pink-200 font-medium">Privater Bereich</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 shadow-2xl">
          {error && (
            <div className="mb-5 bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-2">
              <span>⚠️</span>
              <span className="text-red-300 text-sm font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-pink-200 text-sm font-semibold mb-2 uppercase tracking-widest">
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setError(null); setPassword(e.target.value); }}
                placeholder="••••••••"
                autoFocus
                autoComplete="current-password"
                className="w-full bg-white/10 border border-white/30 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-purple-900 font-black text-lg rounded-xl py-3 transition-all active:scale-95 shadow-lg shadow-yellow-400/30"
            >
              {loading ? "…" : "Einloggen →"}
            </button>
          </form>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          Keine echten Lyrics. Alles erfunden. Alles Spaß.
        </p>
      </div>
    </main>
  );
}
