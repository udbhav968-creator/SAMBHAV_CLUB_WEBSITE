# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's **Security → Report a vulnerability** (private advisory) on this repository, or email the club tech lead. Include steps to reproduce and the affected URL or file. We aim to acknowledge within 3 days and fix high-severity issues within 14 days.

## Supported versions

Only the latest `main` branch (deployed site) is supported.

## Controls in place

| Area | Control |
|---|---|
| Passwords | bcrypt cost 12; policy ≥ 8 chars with a letter and a digit; equal-cost dummy hash so unknown accounts can't be detected by timing |
| Weak admin PIN | Signing in with a password below the policy sets `mustChangePassword`; in production every admin tool returns `403 password_change_required` until it is rotated |
| Password change / reset | Current password **and** a 6-digit SMS OTP to the registered mobile; OTP: CSPRNG, hashed at rest, 5 min TTL, 5 tries, single use, 3 sends / 15 min |
| Sessions | 15-min HS256 access JWT (issuer + audience + algorithm pinned) held in memory; httpOnly, SameSite=Strict, path-scoped refresh cookie; rotation with reuse detection (family revoked) |
| Revocation | Password change/reset, role change and deactivation revoke refresh tokens **and** all access tokens issued before that instant (Redis not-before, ms precision); sockets re-check before joining admin rooms |
| Brute force | Per-account lockout (5 fails → 15 min); limits per (IP, account) and per IP; API limits per user — safe for campus NAT |
| Authorisation | Hierarchical RBAC; attendance management is ADMIN-only; Vihaan's personal tool reads only the JWT's user |
| Attendance integrity | TOTP codes (30 s, ±1 step) from an AES-256-GCM-encrypted per-session secret; 5 wrong codes per session per user; optional `CHECKIN_ALLOWED_CIDRS` so codes only work on campus Wi-Fi |
| Web | Strict CSP, HSTS, X-Frame-Options/frame-ancestors none, nosniff, Referrer-Policy, Permissions-Policy (camera/mic self only); markdown in chat is escaped before formatting |
| AI | Prompt states tool output is untrusted data; navigation restricted to an allow-list of public pages; per-user/IP quotas and a daily budget cap |
| Logging | Request IDs on every response; Authorization, Cookie and Set-Cookie redacted from logs; audit log for security events |
| Supply chain | Pinned dependencies, lockfile, Dependabot, `npm audit` gate (runtime, high+), CodeQL, dependency review, gitleaks, Trivy image scan, SPDX SBOM |
| Runtime | Non-root container, read-only root filesystem, `no-new-privileges`, all Linux capabilities dropped (VPS compose) |

Threat model and residual risks: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
