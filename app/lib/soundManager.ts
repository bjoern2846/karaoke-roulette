// Singleton — import and call anywhere after first user interaction.

const SOUND_PATHS = {
  click:              "/sounds/click.mp3",
  correctGuess:       "/sounds/correct-guess.mp3",
  genreReveal:        "/sounds/genre-reveal.mp3",
  roundEnd:           "/sounds/round-end.mp3",
  wheelSpin:          "/sounds/wheel-spin.mp3",
  winnerApplause:     "/sounds/winner-applause.mp3",
  winnerPodiumReveal: "/sounds/winner-podium-reveal.mp3",
} as const;

export type SoundName = keyof typeof SOUND_PATHS;

class SoundManager {
  private buffers = new Map<SoundName, HTMLAudioElement>();
  private unlocked = false;
  private _muted = false;
  private _volume = 0.7;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const v = localStorage.getItem("karaoke_volume");
        if (v !== null) {
          const n = parseFloat(v);
          if (!isNaN(n)) this._volume = Math.max(0, Math.min(1, n));
        }
      } catch {}
      try {
        this._muted = localStorage.getItem("karaoke_muted") === "true";
      } catch {}
    }
  }

  /** Call once on client mount to preload all audio buffers. */
  preload(): void {
    if (typeof window === "undefined") return;
    for (const [name, path] of Object.entries(SOUND_PATHS) as [SoundName, string][]) {
      if (this.buffers.has(name)) continue;
      const a = new Audio(path);
      a.preload = "auto";
      this.buffers.set(name, a);
    }
  }

  /**
   * Call on first confirmed user interaction (click, keydown, etc.).
   * Browsers require a gesture before AudioContext / HTMLAudioElement.play() works.
   * We silently play+pause every buffer to prime them.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const [, a] of this.buffers) {
      const saved = a.volume;
      a.volume = 0;
      a.play()
        .then(() => { a.pause(); a.currentTime = 0; a.volume = saved; })
        .catch(() => { a.volume = saved; });
    }
  }

  play(name: SoundName, opts?: { volume?: number }): void {
    if (this._muted) return;
    if (typeof window === "undefined") return;

    const original = this.buffers.get(name);
    if (!original) {
      console.warn(`[SoundManager] "${name}" not preloaded — call preload() first`);
      return;
    }

    try {
      // cloneNode so rapid / overlapping plays work (e.g. correct-guess twice fast)
      const clone = original.cloneNode() as HTMLAudioElement;
      clone.volume = Math.max(0, Math.min(1, opts?.volume ?? this._volume));
      const p = clone.play();
      if (p) {
        p.catch((e: Error) => {
          if (e.name === "NotAllowedError") {
            // Browser blocked — audio not unlocked yet, ignore silently
          } else {
            console.warn(`[SoundManager] play("${name}") rejected:`, e.message);
          }
        });
      }
    } catch (e) {
      console.warn(`[SoundManager] play("${name}") threw:`, e);
    }
  }

  setMuted(m: boolean): void {
    this._muted = m;
    try { localStorage.setItem("karaoke_muted", String(m)); } catch {}
  }
  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem("karaoke_volume", String(this._volume)); } catch {}
  }
  isMuted(): boolean { return this._muted; }
  getVolume(): number { return this._volume; }
  isUnlocked(): boolean { return this.unlocked; }
}

export const soundManager = new SoundManager();
