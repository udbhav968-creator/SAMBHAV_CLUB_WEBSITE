# Push this project to GitHub

Target repository: **https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE** (must be empty — no README added on GitHub).

This folder is already a git repository with one commit and the remote `origin` set to the address above. You only need to **push** it, signed in as `udbhav968-creator`.

## Option A — GitHub Desktop (no commands, easiest)

| Step | Do this |
|---|---|
| 1 | Install **GitHub Desktop** from https://desktop.github.com and sign in as `udbhav968-creator` |
| 2 | Unzip `SAMBHAV_CLUB_WEBSITE.zip` (e.g. to `Documents`) |
| 3 | GitHub Desktop → **File → Add local repository…** → choose the `SAMBHAV_CLUB_WEBSITE` folder → **Add repository** |
| 4 | Click **Publish branch** / **Push origin** (top bar) |
| 5 | Open https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE — all files are there |

## Option B — Command line (Windows PowerShell, macOS or Linux)

```bash
cd path/to/SAMBHAV_CLUB_WEBSITE
git status                     # should say: On branch main, nothing to commit
git remote -v                  # should show the SAMBHAV_CLUB_WEBSITE address
git push -u origin main
```

When git asks you to sign in:

| Prompt | Answer |
|---|---|
| Browser window (Git Credential Manager) | Sign in to GitHub as `udbhav968-creator` and approve |
| `Username:` | `udbhav968-creator` |
| `Password:` | **Not your GitHub password** — a Personal Access Token: GitHub → Settings → Developer settings → Personal access tokens → *Fine-grained* → Repository access: `SAMBHAV_CLUB_WEBSITE` → Permissions: **Contents: Read and write**, **Workflows: Read and write** → Generate, copy, paste |

> The **Workflows** permission is needed because the project contains `.github/workflows/*` files.

## Option C — VS Code

Open the folder in VS Code → **Source Control** panel → **⋯ → Push** → sign in with GitHub when asked.

## If the push is rejected

| Message | Fix |
|---|---|
| `rejected … fetch first` (the GitHub repo already has a README/licence) | `git pull --rebase origin main --allow-unrelated-histories` then `git push -u origin main` |
| `refusing to allow … workflow` | Your token lacks **Workflows: Read and write** — create a new token with it |
| `Repository not found` | You are signed in as a different GitHub account, or the repo name differs |
| `Permission denied` | Ask the repo owner to add you as a collaborator with **Write** access |

## After the push (5 minutes)

| # | Where | Action |
|---|---|---|
| 1 | GitHub → **Actions** | Enable workflows if asked. **CI**, **Security** and **LLMOps** start automatically |
| 2 | GitHub → Settings → Secrets and variables → **Actions** | (Optional) add secret `ANTHROPIC_API_KEY` — turns on the nightly Vihaan AI quality check |
| 3 | GitHub → Settings → **Code security** | Turn on Dependabot alerts and secret scanning |
| 4 | README on GitHub | Click **Deploy to Render** → fill: admin password, admin mobile (`+91…`), SMS key, Anthropic key, site address → **Apply** |
| 5 | Your new site | Sign in as `udbhav`, go to **Admin → Security**, change the starter PIN with the SMS code |

Never commit `.env` files, passwords, API keys or the admin mobile number — they belong only in Render's environment settings.
