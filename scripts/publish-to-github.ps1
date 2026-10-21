# Publishes this project to https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE (Windows PowerShell).
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File scripts\publish-to-github.ps1
param([string]$Repo = "https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE.git")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host "Install Git for Windows first: https://git-scm.com/download/win"; exit 1 }
if (-not (git config --global user.name) -or -not (git config --global user.email)) {
  Write-Host 'Set your git identity once, then re-run:'; Write-Host '  git config --global user.name  "Your Name"'; Write-Host '  git config --global user.email "you@example.com"'; exit 1 }
if (Test-Path .env) { Write-Host "Note: .env exists and is ignored by .gitignore - it will NOT be uploaded." }
if (-not (Test-Path .git)) {
  git init -q -b main
  git add -A
  $msg = @"
Sambhav club platform: Arena, LMS, admin attendance, Vihaan AI, LLMOps

- React 18 + Vite web app (PWA) and Express + PostgreSQL + Redis API
- Game-theory Arena, Bloom-tagged learning modules, events, leaderboard
- TOTP/QR attendance run only by the admin, SMS-OTP password changes
- Vihaan AI robot guide (Claude tool use, instant router, offline mode)
- Security hardening, CI (lint, types, coverage, Playwright), security scans
- LLMOps: prompt registry, eval gates, telemetry, feedback, metrics, alerts
- Render Blueprint, VPS + Caddy, GHCR release pipeline, monitoring stack

"@
  $msg | git commit -q -F -
  Write-Host "Created the first commit."
}
git remote get-url origin 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { git remote set-url origin $Repo } else { git remote add origin $Repo }
Write-Host "Pushing to $Repo ..."
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nPush was rejected. If the GitHub repo already has files (e.g. a README), run:"
  Write-Host "  git pull --rebase origin main --allow-unrelated-histories; git push -u origin main"; exit 1 }
Write-Host "`nDone. On GitHub: Settings > Secrets and variables > Actions > add ANTHROPIC_API_KEY (optional, enables the live Vihaan eval)."
Write-Host "Then open the README on GitHub and click 'Deploy to Render'."
