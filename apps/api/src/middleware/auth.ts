import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "../db/schema.js";
import type { KV } from "../lib/kv.js";
import { forbidden, unauthorized } from "../lib/errors.js";

/** `mcp` = must change password: privileged routes are refused until the (weak) password is rotated. */
export interface AuthUser { id: string; role: Role; iatMs?: number; mcp?: boolean }
declare global { namespace Express { interface Request { user?: AuthUser } } }

/** `ims` = issued-at in milliseconds (JWT `iat` is whole seconds — too coarse for same-second revocation). */
export interface AccessClaims { sub: string; role: Role; ims: number; mcp?: boolean }
const ALG = "HS256" as const;

export const signAccess = (u: { id: string; role: Role }, secret: string, ttl: string, mustChange = false) =>
  jwt.sign({ sub: u.id, role: u.role, ims: Date.now(), ...(mustChange ? { mcp: true } : {}) } satisfies AccessClaims, secret, { algorithm: ALG, expiresIn: ttl as jwt.SignOptions["expiresIn"], issuer: "sambhav", audience: "sambhav-api" });

export function verifyAccess(token: string, secret: string): AuthUser {
  const c = jwt.verify(token, secret, { algorithms: [ALG], issuer: "sambhav", audience: "sambhav-api" }) as jwt.JwtPayload & AccessClaims;
  return { id: c.sub, role: c.role, iatMs: typeof c.ims === "number" ? c.ims : (c.iat ?? 0) * 1000, mcp: c.mcp === true };
}

/* ---------- revocation of short-lived access tokens ----------
 * Access tokens are stateless (15 min). When a password changes, an account is deactivated or a role changes,
 * every token issued before that moment is rejected: we store "not-before" per user in Redis for one token lifetime. */
let store: KV | null = null;
const NBF_TTL = 60 * 60; // comfortably longer than ACCESS_TTL
export const configureAuth = (kv: KV) => { store = kv; };
export async function revokeAccessTokens(kv: KV, userId: string) {
  await kv.set(`auth:nbf:${userId}`, Date.now(), NBF_TTL);
}
export async function isRevoked(u: AuthUser) {
  if (!store || u.iatMs === undefined) return false;
  const nbf = await store.get<number>(`auth:nbf:${u.id}`);
  return nbf !== null && u.iatMs <= nbf;
}

export const authenticate = (secret: string, required = true) => (req: Request, _res: Response, next: NextFunction) => {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return required ? next(unauthorized()) : next();
  let user: AuthUser;
  try { user = verifyAccess(h.slice(7), secret); }
  catch { return next(unauthorized("Session expired — please sign in again")); }
  isRevoked(user).then((revoked) => {
    if (revoked) return next(unauthorized("Session ended — please sign in again"));
    req.user = user; next();
  }, next);
};

const RANK: Record<Role, number> = { MEMBER: 1, COORDINATOR: 2, ADMIN: 3 };
/** Hierarchical RBAC: requireRole("COORDINATOR") admits coordinators and admins. */
export const requireRole = (min: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (RANK[req.user.role] < RANK[min]) return next(forbidden());
  if (req.user.mcp) return next(forbidden("Change your password (Admin → Security) before using admin tools.", "password_change_required"));
  next();
};
/** Inline role checks honour the weak-password gate too: a must-change session acts as a plain member. */
export const hasRole = (u: AuthUser | undefined, min: Role) => !!u && (u.mcp ? RANK.MEMBER : RANK[u.role]) >= RANK[min];
