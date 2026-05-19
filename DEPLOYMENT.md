# Deployment Guide

Karaoke Roulette splits into two deployable pieces:

- **Frontend** → Vercel (Next.js static + SSR)
- **Socket.io server** → Render / Railway / any Node.js host

---

## 1. Deploy the Socket.io Server (Render / Railway)

The socket server is `server/index.ts`. It runs a combined Next.js + Socket.io process — on Render/Railway you only need the socket part, but running the full process is fine.

### Render (recommended free tier)

1. Create a new **Web Service** in Render, connect your GitHub repo.
2. **Build Command:** `npm install`
3. **Start Command:** `npm run server`
4. **Environment Variables:**
   - `PORT` — Render sets this automatically
   - `CORS_ORIGIN` — set to your Vercel frontend URL, e.g. `https://karaoke-roulette.vercel.app`
     - Multiple URLs: comma-separated `https://app.vercel.app,https://app-preview.vercel.app`
     - Leave unset (defaults to `*`) if you want to allow all origins
5. After deploy, copy the service URL, e.g. `https://karaoke-roulette-server.onrender.com`

---

## 2. Deploy the Frontend (Vercel)

### Setup

1. Push repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
3. Framework: **Next.js** (auto-detected).
4. Build Command: `npm run build` (default).
5. Output Directory: `.next` (default).

### Environment Variable

In Vercel project settings → **Environment Variables**, add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SOCKET_URL` | `https://YOUR-SOCKET-SERVER.onrender.com` |

This tells the frontend where to connect for multiplayer.

### Deploy

Click **Deploy**. Vercel runs `next build` and serves the frontend globally.

---

## Local Development

No env file needed — the socket client falls back to the same origin (localhost:3000) automatically.

```bash
npm run dev   # starts Next.js + Socket.io on http://localhost:3000
```

To use a `.env.local` for local testing with a remote socket server:

```bash
# .env.local
NEXT_PUBLIC_SOCKET_URL=https://YOUR-SOCKET-SERVER.onrender.com
```

---

## Architecture

```
Browser ──── HTTPS ────▶ Vercel (Next.js frontend)
     │
     └──── WebSocket ──▶ Render (Socket.io server)
```

All game state lives on the Socket.io server. Vercel serves only static assets and React pages.
