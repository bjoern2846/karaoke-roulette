"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

const SOCKET_OPTS = {
  path: "/api/socket",
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
};

export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL;
    socket = url
      ? io(url, SOCKET_OPTS)
      : io(SOCKET_OPTS);
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
