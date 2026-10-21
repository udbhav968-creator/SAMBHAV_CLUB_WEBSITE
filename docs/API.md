# API reference (v1)

Base path `/api/v1`. Auth: `Authorization: Bearer <accessToken>`; refresh via httpOnly cookie. Roles: **M**ember, **C**oordinator, **A**dmin (hierarchical). Attendance management is **Admin-only**. "–" = public.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/register` | – | Create account → `{accessToken, user}` |
| POST | `/auth/login` | – | Sign in with `{identifier: email-or-username, password}` · 5 failures lock the account 15 min |
| POST | `/auth/password/otp` | M | Text a 6-digit OTP to the account's registered mobile (3 per 15 min) |
| POST | `/auth/password/change` | M | `{currentPassword, otp, newPassword}` → signs out every session |
| POST | `/auth/password/forgot` | – | `{identifier}` → OTP to the registered mobile (always 202) |
| POST | `/auth/password/reset` | – | `{identifier, otp, newPassword}` |
| POST | `/auth/refresh` | cookie | Rotate refresh token → new access token |
| POST | `/auth/logout` | – | Revoke refresh token |
| GET | `/auth/me` | M | Current user |
| GET | `/users?q&programme&year&role` | M | Directory (staff also see emails/status) |
| GET | `/users/:id/summary` | M | Attendance, points, rank, badges, events, quiz bests |
| PATCH | `/users/:id` | self / C / A | Profile; `title` needs C; `role`,`isActive` need A |
| DELETE | `/users/:id` | A | Soft-deactivate + revoke sessions |
| GET | `/events?scope=upcoming\|past\|all` | – | List with counts (`isRegistered` when signed in) |
| POST / PATCH / DELETE | `/events[/:id]` | C | Manage events |
| POST / DELETE | `/events/:id/registrations` | M | Register / cancel (capacity-safe, idempotent) |
| GET | `/events/:id/registrations` | C | Registrant list |
| GET | `/attendance/sessions` | M | Sessions with headcount |
| POST | `/attendance/sessions` | **A** | Create session (secret generated & encrypted) |
| POST | `/attendance/sessions/:id/open` · `/close` | **A** | Change status |
| GET | `/attendance/sessions/:id/code` | **A** | Current TOTP code + QR URL + seconds left |
| POST | `/attendance/check-in` | M | `{sessionId, code, via}` |
| PUT | `/attendance/sessions/:id/attendance/:userId` | **A** | Manual mark `{present}` |
| GET | `/attendance/sessions/:id/attendance` | **A** | Who is present |
| GET | `/attendance/me` | M | Own history and rate |
| GET | `/attendance/report?format=json\|csv` | **A** | Register matrix |
| GET | `/modules` · `/modules/:id` | – | Modules (+progress when signed in); questions without keys |
| POST | `/modules/:id/lessons/:idx/complete` | M | Mark lesson done |
| POST | `/modules/:id/attempts` | M | `{answers:{order:index}, open:{text, rubric[]}}` → graded result |
| GET | `/games/fair` · PUT `/games/fair/client-seed` · POST `/games/fair/rotate` | M | Provably-fair seed management |
| POST | `/games/roulette/spin` · `/roulette/reset-credits` | M | `{bets:{"red":10,"n:17":5}}` |
| GET | `/games/pd/strategies` | M | Strategy catalogue |
| POST | `/games/pd/matches` · `/pd/matches/:id/moves` · `/pd/tournament` | M | Repeated PD |
| POST / DELETE | `/games/guess` | M | ⅔ round vs level-k bots / reset memory |
| POST | `/games/rps` | M | One RPS move |
| POST | `/games/auction/rounds` · `/auction/rounds/:id/bid` | M | Sealed-bid auction |
| POST | `/games/ultimatum/propose` · `/ultimatum/offers` · `/ultimatum/offers/:id` | M | Ultimatum game |
| POST | `/games/nash/solve` | M | `{A, B}` ≤ 3×3 |
| GET | `/games/history` | M | Own ledger + totals |
| GET | `/leaderboard?limit` | – | Ranked totals |
| GET | `/stats` | – | Public homepage numbers |
| GET | `/admin/stats` · `/admin/audit` | A | Platform stats, audit trail |
| POST | `/ai/feedback` | – | `{id, rating: 1 \| -1, note?}` — rate one Vihaan answer once (204) |
| GET | `/admin/ai?days=7` | A | Vihaan LLMOps analytics: volume by mode, latency p50/p95, first-token, tokens, cost, helpfulness, tools, prompt versions, 👎 review queue |
| GET | `/metrics` (root, not `/api`) | Bearer `METRICS_TOKEN` | Prometheus exposition; 404 without the token or when unset |
| POST | `/ai/chat` | – (optional M) | **Vihaan** chat. Body `{messages:[{role,content}] ≤16, page}`. Response is `text/event-stream` — see below |

### Vihaan stream (`POST /api/v1/ai/chat`)
| Event | Data | Client action |
|---|---|---|
| `delta` | `{text}` | Append to the answer |
| `action` | `{navigate:"/arena/nash"}` | Route there (path is from a server allow-list) |
| `tool` | `{name}` | Show progress ("Checking the club board…") |
| `done` | `{mode, id, prompt}` | Finish; show the mode; `id` enables 👍/👎 |
| `error` | `{message}` | Show a friendly error |

Limits: 300 requests / 10 min per user or IP; model calls additionally bounded by `AI_USER_QUOTA`, `AI_VISITOR_QUOTA` and `AI_DAILY_CAP` (beyond them the answer comes from offline mode). Design: [VIHAAN.md](VIHAAN.md).

### WebSocket events (Socket.IO, auth via `auth.token`)
| Direction | Event | Payload |
|---|---|---|
| client → server | `session:watch` / `session:unwatch` | sessionId (coordinators) |
| server → client | `attendance:marked` / `attendance:changed` | live console feed |
| server → client | `session:status`, `events:changed`, `notice`, `points` | cache invalidation / toasts |
| client → server | `live:join`, `live:start {seconds}`, `live:guess {value}`, `live:close` | live ⅔ round |
| server → client | `live:state`, `live:result` | round state / results |
