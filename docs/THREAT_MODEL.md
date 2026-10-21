# Threat model (STRIDE)

Assets: the attendance record (academic consequence), the admin account `udbhav`, member personal data (name, email, roll number, mobile), the points ledger, the Anthropic API budget.

| # | Threat | STRIDE | Likelihood | Impact | Mitigation | Residual risk |
|---|---|---|---|---|---|---|
| 1 | Guessing the admin PIN `1234` | Spoofing | High | Critical | Lockout after 5 fails; per-(IP, account) and per-IP limits; **production blocks admin tools until the PIN is changed**; OTP to registered mobile for any change | Low once rotated |
| 2 | Stolen access token reused after the owner changes password | Spoofing | Medium | High | Redis not-before revocation on password change, reset, role change, deactivation | 1-hour Redis TTL > 15-min token life — none |
| 3 | Stolen refresh cookie | Spoofing | Low | High | httpOnly + SameSite=Strict + path-scoped; rotation with reuse detection revokes the family | Device malware can still act until reuse is detected |
| 4 | SIM-swap to intercept the OTP | Spoofing | Low | High | OTP is a second factor alongside the current password for change; reset audited | Reset relies on SMS only — consider TOTP app 2FA (roadmap) |
| 5 | Proxy attendance (code shared to absent friends) | Tampering | High | Medium | 30-s rotating codes, QR on projector, roll-call review, **optional campus-only CIDR rule** | Friend on campus Wi-Fi can still relay — use roll call for spot checks |
| 6 | Brute-forcing the 6-digit check-in code | Tampering | Low | Medium | 5 wrong codes per session per user, then locked to manual marking | — |
| 7 | Account enumeration | Information disclosure | Medium | Low | Generic login error, equal-time bcrypt, forgot-password always 202 | Registration reveals an email is taken (usability trade-off) |
| 8 | XSS via notices, event titles or chat | Tampering | Medium | High | React escaping; chat markdown escapes first; strict CSP (`script-src 'self'`) | Lesson HTML is first-party seed content only |
| 9 | Prompt injection through club data into Vihaan | Elevation | Medium | Low | Tool results marked untrusted; tools read-only; navigation allow-list; no tool can mark attendance or read others' data | Model may still repeat odd text from a notice |
| 10 | AI cost abuse | Denial of service | Medium | Medium | Instant router, per-user and per-IP quotas, `AI_DAILY_CAP`, offline fallback | Capped by design |
| 11 | Check-in burst overwhelms API | Denial of service | Medium | High | Per-user limits, idempotent insert, k6 burst test, horizontal scale via Redis adapter | Free hosting tiers sleep — use a paid instance on club nights |
| 12 | Vulnerable dependency | Elevation | Medium | High | Dependabot, npm audit gate, CodeQL, Trivy, SBOM | Zero-days |
| 13 | Leaked secrets in git | Information disclosure | Low | Critical | `.env` ignored, gitleaks in CI, secrets only in host env vars | — |
| 14 | Insider (coordinator) tampering with attendance | Repudiation | Low | Medium | Attendance management is ADMIN-only; every mark/unmark is audited with actor | Admin is trusted |
| 15 | Personal data exposure | Information disclosure | Low | High | Directory hides email/phone from members; phone masked everywhere; logs redact credentials | DPDP Act notice and retention policy still to be published (roadmap) |
