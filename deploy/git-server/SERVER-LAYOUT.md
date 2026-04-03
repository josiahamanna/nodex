# Git server layout (`/srv/git`) and automation

**Step-by-step migration:** see [MIGRATION.md](MIGRATION.md).

## What runs on boot (systemd)

Git hooks are **not** a daemon: `post-receive` runs only when a `git push` finishes. You still want these services **enabled** so SSH, tunnels, and Docker survive reboots:

| Service | Role |
|--------|------|
| `ssh` | `git@git.nodex.studio` (or your host) |
| `docker` | `npm run deploy` uses Compose |
| `cloudflared` | Your Cloudflare Tunnel to reach SSH/HTTP (see [../systemd/README.md](../systemd/README.md)) |

There is no separate “hook service”; each bare repo’s `hooks/post-receive` (or a wrapper calling `/srv/git/bin/post-receive-shared.sh`) is invoked by Git.

## Directory layout

Recommended:

- **`/srv/git/`** — owned by the `git` user (or `root:git` with group write if multiple admins). Holds **bare** repositories only.
  - Example: `/srv/git/nodex/nodex.git`
  - Example: `/srv/git/other/other.git`
- **`/srv/git/bin/`** — shared scripts, e.g. `post-receive-shared.sh` (executable, not secrets).
- **Deploy checkouts** — separate non-bare trees where you run builds (e.g. `/var/lib/nodex/checkout`), often owned by a user in the `docker` group.

Personal trees such as `~/nodex-studio` on user **`jehu`** are fine for **clones, editors, and copies of hook templates**; you do **not** have to put bare repos in `jehu`’s home. Keeping bare repos under **`/srv/git`** avoids mixing SSH `git` account data with personal files.

## `git` user vs `jehu`

- **`git`**: owns `/srv/git`, receives pushes, runs hooks. If hooks call `npm run deploy` and Docker, `git` usually needs membership in the **`docker`** group (security tradeoff) **or** hooks `sudo -u deploy` / invoke a small setuid helper—keep it simple unless you harden further.
- **`jehu`**: normal login, optional checkout under `/home/jehu/...` for development; not required for serving pushes.

## Multiple repositories

1. Install **`post-receive-shared.sh`** once: `/srv/git/bin/post-receive-shared.sh`.
2. Per bare repo, install a **wrapper** in `hooks/post-receive` (see [post-receive.example](post-receive.example) and [post-receive.wrapper.example](post-receive.wrapper.example)) with the correct `BARE_GIT_DIR`, `DEPLOY_ROOT`, and `DEPLOY_LOCK`.
3. Configure each bare repo’s **`github`** remote and credentials for the `git` user.

## Files in this repo

- [post-receive-shared.sh](post-receive-shared.sh) — shared hook logic.
- [post-receive.example](post-receive.example) — nodex wrapper.
- [post-receive.wrapper.example](post-receive.wrapper.example) — second-project template.
