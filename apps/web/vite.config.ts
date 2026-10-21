import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.API_ORIGIN ?? "http://localhost:4000";
const proxy = { "/api": api, "/socket.io": { target: api, ws: true } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: {
    sourcemap: true,
    rollupOptions: { output: { manualChunks: { react: ["react", "react-dom", "react-router-dom"], query: ["@tanstack/react-query"] } } },
  },
});
