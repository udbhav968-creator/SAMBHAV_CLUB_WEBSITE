import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { refreshSession, setAuthListener, type Role, type User } from "../api/client";

const RANK: Record<Role, number> = { MEMBER: 1, COORDINATOR: 2, ADMIN: 3 };
interface AuthState { user: User | null; ready: boolean; can: (min: Role) => boolean; setUser: (u: User | null) => void }
const Ctx = createContext<AuthState>({ user: null, ready: false, can: () => false, setUser: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setAuthListener(setUser); refreshSession().finally(() => setReady(true)); }, []);
  const can = (min: Role) => !!user && RANK[user.role] >= RANK[min];
  return <Ctx.Provider value={{ user, ready, can, setUser }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

export function RequireAuth({ children, role }: { children: ReactNode; role?: Role }) {
  const { user, ready, can } = useAuth(); const loc = useLocation();
  if (!ready) return <div className="wrap band"><div className="skeleton" style={{ width: 240 }} /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (role && !can(role)) return <div className="wrap band"><div className="empty"><b>You don't have access to this page</b>It's available to {role.toLowerCase()}s.</div></div>;
  return <>{children}</>;
}
