# Sambhav — improvement roadmap to a top-tier club platform

Benchmarked against leading student-society sites (IIT technical/cultural societies, Harvard/MIT/Stanford clubs) and professional bodies such as IEEE. Status as of this release.

## 1. Delivered in this release

| # | Area | Before | Now | Impact |
|---|---|---|---|---|
| 1 | AI guidance | No assistant | **Vihaan** robot: navigation, streaming chat, live club data, voice in/out, Ctrl K hand-off | Members find anything in one question; newcomers onboard themselves |
| 2 | AI cost control | — | Instant router (no model for navigation), per-user quota, daily budget cap, offline fallback | Predictable monthly bill; site never breaks if the AI is down |
| 3 | Campus scale | Per-IP limits (would lock out a hall on one Wi-Fi NAT) | Limits keyed per user / per account, generous per-IP ceiling | 500 students can check in together from campus Wi-Fi |
| 4 | Deployment | Local Docker only | Single-container image, Render Blueprint, VPS + Caddy auto-HTTPS, GHCR release pipeline | Live on a real domain in under an hour |
| 5 | Mobile | Responsive pages | Installable PWA, offline shell, app shortcuts (Check in, Arena, Leaderboard) | Home-screen app for members |
| 6 | SEO & sharing | Generic title | Open Graph card, Twitter card, sitemap, robots.txt, schema.org Organization | Rich previews on WhatsApp/LinkedIn; discoverable |
| 7 | Security headers | Basic | CSP, HSTS, Permissions-Policy (camera/mic self only), frame-ancestors none — at app and edge | Grade-A headers |
| 8 | Load readiness | Unit + integration tests | k6 script for a 500-member check-in burst with SLO thresholds | Evidence before every fest |
| 9 | Backups | Documented only | Nightly `pg_dump` sidecar, 14-day retention (VPS); managed backups (Render) | Recoverable from mistakes |
| 10 | Attendance governance | Coordinators could run sessions | Only the admin (`udbhav`) runs attendance; password change only with SMS OTP to the registered mobile | Clear accountability |

## 1b. Delivered in release 3 (security, quality, LLMOps)

| # | Area | Now | Impact |
|---|---|---|---|
| 10a | Dependencies | Vulnerable express, drizzle-orm, react-router, vite, vitest upgraded; runtime `npm audit` clean at high+ | No known exploitable runtime CVEs |
| 10b | Sessions | Instant access-token revocation on password change, reset, role change, deactivation; pinned JWT algorithm/issuer/audience | Stolen or stale tokens die immediately |
| 10c | Admin PIN | Production locks admin tools until the starter PIN is changed via SMS OTP | The public default PIN can't be abused |
| 10d | Attendance integrity | Optional campus-network-only check-in (`CHECKIN_ALLOWED_CIDRS`) | Fewer proxy check-ins |
| 10e | Supply chain | CodeQL, dependency review, gitleaks, Trivy, SBOM, Dependabot | Continuous security scanning |
| 10f | Quality | ESLint, coverage gates, web unit tests, 12 Playwright journeys in CI | Bugs caught before deploy |
| 10g | LLMOps | Prompt registry, eval gates, nightly drift eval, telemetry, feedback loop, admin AI page | Measurable, improvable AI |
| 10h | Observability | Prometheus metrics, Grafana dashboard, 8 tested alerts, request IDs, redacted logs | Problems seen before members report them |

## 2. Next (recommended within one semester)

| # | Area | Gap | Recommendation | Effort | Priority |
|---|---|---|---|---|---|
| 11 | Identity | Email/password only | College Google / Microsoft SSO; authenticator-app 2FA for admin | M | High |
| 12 | Notifications | None | Email + WhatsApp reminders for events; low-attendance nudges | M | High |
| 13 | Accessibility | Focus states, reduced motion | Full WCAG 2.1 AA audit with NVDA/VoiceOver; fix findings | M | High |
| 14 | Observability | Metrics, dashboard and alerts (done) | Error tracking (Sentry), external uptime monitor, OpenTelemetry traces | S | Medium |
| 15 | Data protection | — | Privacy notice and consent under India's DPDP Act 2023; retention and deletion policy | S | High |
| 16 | Backups | Local dumps | Encrypted off-site copy + quarterly restore drill | S | Medium |
| 17 | Vihaan | Keyword search | Semantic search over lesson text; per-module tutor mode with Bloom-tagged practice | M | Medium |
| 18 | Events | Listing + registration | schema.org Event markup, calendar (.ics) export, QR tickets | S | Medium |

## 3. Later (to stand with the best societies)

| # | Area | Recommendation | Effort |
|---|---|---|---|
| 19 | Content | Event reports, photo gallery, alumni and speaker pages | M |
| 20 | Partners | Sponsors page, partnership deck, impact numbers | S |
| 21 | Certificates | Auto-generated PDF certificates with QR verification | M |
| 22 | Multiplayer | Live auction and Prisoner's-Dilemma tournament lobbies | L |
| 23 | Research | Publish club experiments (e.g. 2/3-game data) as open datasets | M |
| 24 | Internationalisation | Full Hindi interface | M |

Effort: S ≈ 1 week, M ≈ 2–4 weeks, L ≈ 1–2 months for one developer.
