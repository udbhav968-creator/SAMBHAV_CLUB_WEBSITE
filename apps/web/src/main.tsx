import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/ui";
import App from "./App";
import "./styles.css";

try { const t = localStorage.getItem("sambhav.theme"); if (t) document.documentElement.dataset.theme = t; } catch { /* storage blocked */ }
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode><QueryClientProvider client={qc}><AuthProvider><ToastProvider><BrowserRouter><App /></BrowserRouter></ToastProvider></AuthProvider></QueryClientProvider></StrictMode>,
);

// Installable app + offline shell (production builds only, so dev HMR is never cached).
if (import.meta.env.PROD && "serviceWorker" in navigator) addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => { /* non-fatal */ }); });
