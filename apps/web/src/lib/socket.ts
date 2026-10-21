import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getAccessToken, refreshSession } from "../api/client";

let socket: Socket | null = null;
/** One shared, authenticated connection; reconnects with a fresh access token. */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({ path: "/socket.io", transports: ["websocket"], auth: (cb) => cb({ token: getAccessToken() }) });
  socket.on("connect_error", async (e) => { if (e.message === "unauthorized" && (await refreshSession())) socket?.connect(); });
  return socket;
}
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => { const s = getSocket(); const fn = (p: T) => ref.current(p); s.on(event, fn); return () => { s.off(event, fn); }; }, [event]);
}
