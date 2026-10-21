import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { RequireAuth } from "./auth/AuthContext";
import { Loading } from "./components/ui";
import Home from "./pages/Home";

// Route-level code splitting keeps the first load small; games and admin load on demand.
const L = (f: () => Promise<{ default: React.ComponentType }>) => { const C = lazy(f); return <Suspense fallback={<div className="wrap band"><Loading /></div>}><C /></Suspense>; };
const auth = (el: JSX.Element, role?: "COORDINATOR" | "ADMIN") => <RequireAuth role={role}>{el}</RequireAuth>;

export default function App() {
  return <Routes><Route element={<Layout />}>
    <Route index element={<Home />} />
    <Route path="about" element={L(() => import("./pages/About"))} />
    <Route path="login" element={L(() => import("./pages/Login"))} />
    <Route path="register" element={L(() => import("./pages/Register"))} />
    <Route path="arena" element={L(() => import("./pages/Arena"))} />
    <Route path="arena/nash" element={L(() => import("./pages/games/Nash"))} />
    <Route path="arena/roulette" element={auth(L(() => import("./pages/games/Roulette")))} />
    <Route path="arena/pd" element={auth(L(() => import("./pages/games/Pd")))} />
    <Route path="arena/guess" element={auth(L(() => import("./pages/games/Guess")))} />
    <Route path="arena/rps" element={auth(L(() => import("./pages/games/Rps")))} />
    <Route path="arena/auction" element={auth(L(() => import("./pages/games/Auction")))} />
    <Route path="arena/ultimatum" element={auth(L(() => import("./pages/games/Ultimatum")))} />
    <Route path="arena/live" element={auth(L(() => import("./pages/games/Live")))} />
    <Route path="learn" element={L(() => import("./pages/Learn"))} />
    <Route path="learn/:id" element={L(() => import("./pages/Module"))} />
    <Route path="events" element={L(() => import("./pages/Events"))} />
    <Route path="attendance" element={auth(L(() => import("./pages/attendance/Attendance")))} />
    <Route path="check-in" element={auth(L(() => import("./pages/attendance/CheckIn")))} />
    <Route path="attendance/console/:id" element={auth(L(() => import("./pages/attendance/Console")), "ADMIN")} />
    <Route path="attendance/report" element={auth(L(() => import("./pages/admin/Reports")), "ADMIN")} />
    <Route path="members" element={auth(L(() => import("./pages/Members")))} />
    <Route path="leaderboard" element={L(() => import("./pages/Leaderboard"))} />
    <Route path="notices" element={L(() => import("./pages/Notices"))} />
    <Route path="me" element={auth(L(() => import("./pages/Me")))} />
    <Route path="admin" element={auth(L(() => import("./pages/Admin")), "ADMIN")} />
    <Route path="admin/ai" element={auth(L(() => import("./pages/admin/AiOps")), "ADMIN")} />
    <Route path="admin/attendance/live" element={auth(L(() => import("./pages/admin/Live")), "ADMIN")} />
    <Route path="admin/attendance/roll" element={auth(L(() => import("./pages/admin/Roll")), "ADMIN")} />
    <Route path="admin/attendance/sessions" element={auth(L(() => import("./pages/admin/Sessions")), "ADMIN")} />
    <Route path="admin/attendance/reports" element={auth(L(() => import("./pages/admin/Reports")), "ADMIN")} />
    <Route path="admin/attendance/alerts" element={auth(L(() => import("./pages/admin/Alerts")), "ADMIN")} />
    <Route path="admin/security" element={auth(L(() => import("./pages/admin/Security")), "ADMIN")} />
    <Route path="forgot" element={L(() => import("./pages/Forgot"))} />
    <Route path="*" element={<div className="wrap band"><div className="empty"><b>Page not found</b>Check the address or use the menu.</div></div>} />
  </Route></Routes>;
}
