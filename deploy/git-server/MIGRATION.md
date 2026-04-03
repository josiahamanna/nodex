# Server migration: self-hosted Git + Cloudflare Tunnel + GitHub mirror + tag deploy

This is an end-to-end checklist for a **new or migrated** Linux server. Adjust hostnames (`git.nodex.studio`), Linux users (`jehu`), and GitHub org/repo names to match yours.

**What you get after this:**

- `git push` over SSH (via Cloudflare Tunnel) to a **bare repo** under `/srv/git`.
- Every push **mirrors refs** to **GitHub** (`github` remote on the bare repo).
- Pushes that include a **version tag** matching `v*` run **`npm ci`** and **`npm run deploy -- --stop-old`** in a separate checkout (Docker stack).

**Repo files involved (copy from this Nodex repository):**

| File | Purpose |
|------|---------|
| [post-receive-shared.sh](post-receive-shared.sh) | Installed once as `/srv/git/bin/post-receive-shared.sh` |
| [post-receive.example](post-receive.example) | Copied to each bare repo’s `hooks/post-receive` (nodex) |
| [post-receive.wrapper.example](post-receive.wrapper.example) | Template for additional bare repos |
| [../systemd/cloudflared.service.example](../systemd/cloudflared.service.example) | systemd unit template |
| [SERVER-LAYOUT.md](SERVER-LAYOUT.md) | Layout and concepts |

---

## 0. Conventions used below

| Placeholder | Meaning |
|-------------|---------|
| `git.nodex.studio` | DNS hostname routed through your Cloudflare Tunnel to SSH |
| `jehu` | Your sudo-capable admin user on the server |
| `git` | Unix account used for `git@git.nodex.studio` |
| `ORG/REPO` | GitHub repository (e.g. `Nodex-Studio/nodex`) |

---

## 1. Base packages

Run as root (or with `sudo`):

```bash
apt update
apt install -y git openssh-server docker.io docker-compose-plugin \
  bash util-linux curl ca-certificates
# Node.js: use NodeSource, nvm, or distro packages — you need Node **major** matching the repo (e.g. 22) and `npm` on PATH for user `git`.
```

Enable Docker on boot:

```bash
systemctl enable --now docker
```

---

## 2. User `git` and `/srv/git`

```bash
sudo adduser --disabled-password --gecos 'Git' git
sudo usermod -aG docker git
```

Create layout and ownership (bare repos + shared scripts):

```bash
sudo install -d -o git -g git -m 0750 /srv/git
sudo install -d -o git -g git -m 0755 /srv/git/bin
```

**Deploy checkout** (non-bare tree used by the hook; not under `git` home):

```bash
sudo install -d -o git -g git -m 0755 /var/lib/nodex
```

---

## 3. SSH for `git@git.nodex.studio`

### 3.1 `git` account shell

Hooks run `npm` and `docker`. The `git` user must have a shell where `node`/`npm` and `docker` work. Common choice:

```bash
sudo chsh -s /bin/bash git
```

Verify later (step 10):

```bash
sudo -u git -i bash -lc 'command -v npm && command -v docker'
```

If `npm` is only on your PATH under `jehu`, install Node for system-wide or for `git` (e.g. install to `/usr/local` or use `nvm` under `/home/git` and set `PATH` — see step 7.3).

### 3.2 SSH authorized keys for `git`

```bash
sudo install -d -m 700 -o git -g git /home/git/.ssh
sudo touch /home/git/.ssh/authorized_keys
sudo chmod 600 /home/git/.ssh/authorized_keys
sudo chown git:git /home/git/.ssh/authorized_keys
```

Append **your** public key (from laptop) to `/home/git/.ssh/authorized_keys`:

```bash
# on server, as jehu (example — paste your key line)
echo 'ssh-ed25519 AAAA... you@laptop' | sudo tee -a /home/git/.ssh/authorized_keys
```

### 3.3 SSH daemon

```bash
sudo systemctl enable --now ssh
# or: sshd — depends on distro
```

---

## 4. Cloudflare Tunnel (`cloudflared`)

Install `cloudflared` per [Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/).

Create a tunnel in the Cloudflare dashboard and add a **Public hostname** for SSH, e.g.:

- **Subdomain:** `git` (→ `git.nodex.studio`)
- **Service type:** `SSH`
- **URL:** `localhost:22` on the server

### 4.1 systemd unit

```bash
sudo cp /path/to/nodex/deploy/systemd/cloudflared.service.example /etc/systemd/system/cloudflared.service
sudo nano /etc/systemd/system/cloudflared.service
```

Edit:

- `User=` / `Group=` — often a dedicated `cloudflared` user, or `root` for a quick test (tighten later).
- `ExecStart=` — path to `cloudflared` binary and your **tunnel UUID** and **config** path.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

From your laptop:

```bash
ssh -T git@git.nodex.studio
# should show git-shell message, or bash if configured — next step creates repo
```

---

## 5. Bare repository for Nodex

```bash
sudo install -d -o git -g git -m 0750 /srv/git/nodex
sudo -u git git init --bare /srv/git/nodex/nodex.git
```

### 5.1 GitHub remote on the **bare** repo (mirror target)

```bash
sudo -u git git -C /srv/git/nodex/nodex.git remote add github https://github.com/ORG/REPO.git
# or SSH (recommended if git user has a GitHub deploy key):
# sudo -u git git -C /srv/git/nodex/nodex.git remote add github git@github.com:ORG/REPO.git
```

### 5.2 Credentials for `git` → GitHub

Pick **one**:

**HTTPS + PAT (fine-grained or classic with `repo`):**

```bash
sudo -u git git -C /srv/git/nodex/nodex.git config credential.helper store
# Then once, as git, push to store credentials (or hand-edit /home/git/.git-credentials chmod 600)
```

**SSH deploy key (write access) on GitHub:**

```bash
sudo -u git ssh-keygen -t ed25519 -f /home/git/.ssh/id_ed25519_github -N ''
# Add /home/git/.ssh/id_ed25519_github.pub to GitHub → Repo → Deploy keys (write)
sudo -u git tee -a /home/git/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes
EOF
sudo chmod 600 /home/git/.ssh/config
```

---

## 6. Deploy checkout (non-bare)

This directory is what the hook checks out tags into before `npm run deploy`.

```bash
sudo -u git git clone /srv/git/nodex/nodex.git /var/lib/nodex/checkout
```

Lock file directory (hook creates the file):

```bash
sudo install -d -o git -g git -m 0755 /var/lib/nodex
sudo touch /var/lib/nodex/deploy.lock
sudo chown git:git /var/lib/nodex/deploy.lock
```

---

## 7. Install hook scripts

Copy files from your **Nodex source tree** (or clone the repo on the server to pull them):

```bash
# adjust SOURCE to where post-receive-shared.sh lives on the server
SOURCE=/home/jehu/nodex   # example

sudo install -m 0755 "$SOURCE/deploy/git-server/post-receive-shared.sh" /srv/git/bin/post-receive-shared.sh
sudo cp "$SOURCE/deploy/git-server/post-receive.example" /srv/git/nodex/nodex.git/hooks/post-receive
sudo chown git:git /srv/git/nodex/nodex.git/hooks/post-receive
sudo chmod +x /srv/git/nodex/nodex.git/hooks/post-receive
```

Edit the wrapper if your paths differ:

```bash
sudo -u git nano /srv/git/nodex/nodex.git/hooks/post-receive
# Defaults: BARE_GIT_DIR=/srv/git/nodex/nodex.git
#           DEPLOY_ROOT=/var/lib/nodex/checkout
#           DEPLOY_LOCK=/var/lib/nodex/deploy.lock
```

### 7.1 Optional: `PATH` for non-interactive SSH

If `npm` is missing when the hook runs, prepend at the **top** of `hooks/post-receive` (after shebang):

```bash
export PATH="/usr/local/bin:/home/git/.nvm/versions/node/v22.0.0/bin:$PATH"
```

### 7.2 Repo `.env` for Docker Compose (deploy)

If `npm run deploy` needs secrets, place `/var/lib/nodex/checkout/.env` (or symlink) as required by [docker-compose.yml](../../docker-compose.yml). Owner should allow `git` to read it:

```bash
sudo chown git:git /var/lib/nodex/checkout/.env
sudo chmod 600 /var/lib/nodex/checkout/.env
```

---

## 8. First push from laptop

On your **development machine**, add the tunnel remote and push:

```bash
git remote add nodex git@git.nodex.studio:nodex/nodex.git
# If SSH URL path differs, match how cloudflared maps to `/srv/git/nodex/nodex.git`
git push -u nodex main
```

If the SSH URL must include full path, your tunnel/Git config may use:

```bash
git remote add nodex git@git.nodex.studio:/srv/git/nodex/nodex.git
```

**Note:** Exact `git remote` URL depends on your SSH server `authorized_keys` / `git-shell` setup. Some setups use `git-shell` with `gitreceive-pack` and a **forced** base path; align with your SSH config.

After push, confirm on server:

```bash
sudo -u git git -C /srv/git/nodex/nodex.git log -1 --oneline
```

Confirm GitHub received the branch (refresh GitHub).

---

## 9. Tag push → deploy

Only tags matching **`v*`** (regex `^v` in the shared script) trigger deploy.

```bash
git tag v0.1.0
git push nodex v0.1.0
```

On server, watch logs or Docker:

```bash
sudo docker ps
```

Hook order: mirror refs to GitHub → if tag matches → `flock` → `git fetch/checkout` in `/var/lib/nodex/checkout` → `npm ci` → `npm run deploy -- --stop-old`.

---

## 10. Verification checklist

| Step | Command / check |
|------|------------------|
| SSH via tunnel | `ssh -T git@git.nodex.studio` |
| `git` has npm + docker | `sudo -u git -i bash -lc 'npm -v && docker ps'` |
| Bare repo | `sudo -u git git -C /srv/git/nodex/nodex.git remote -v` shows `github` |
| Hook executable | `test -x /srv/git/nodex/nodex.git/hooks/post-receive` |
| Shared script | `test -x /srv/git/bin/post-receive-shared.sh` |
| Deploy clone | `sudo -u git test -d /var/lib/nodex/checkout/.git` |
| cloudflared | `systemctl is-active cloudflared` |
| docker | `systemctl is-active docker` |
| sshd | `systemctl is-active ssh` or `sshd` |

---

## 11. Additional bare repositories

1. `sudo install -d -o git -g git -m 0750 /srv/git/OTHER && sudo -u git git init --bare /srv/git/OTHER/other.git`
2. Add `github` remote and credentials (same `git` user keys/credential store).
3. Copy [post-receive.wrapper.example](post-receive.wrapper.example) to `hooks/post-receive`, set `BARE_GIT_DIR`, `DEPLOY_ROOT`, `DEPLOY_LOCK`, `chmod +x`.
4. Create matching deploy checkout: `sudo -u git git clone /srv/git/OTHER/other.git /var/lib/other-project/checkout`
5. If deploy commands differ from Nodex, copy and edit `post-receive-shared.sh` under another name (e.g. `/srv/git/bin/post-receive-other.sh`) and point `POST_RECEIVE_SHARED` in the wrapper.

---

## 12. Local development (optional)

By default, **no** deploy runs on your laptop when you `git commit`. To opt in:

```bash
export NODEX_POST_COMMIT_DEPLOY=1
npm run hooks:install
```

See [.githooks/post-commit](../../.githooks/post-commit).

---

## 13. Reboot behavior

Enable and start:

- `cloudflared` (tunnel)
- `docker`
- `ssh`

Git hooks do **not** need their own service. After reboot, `git push` should work once tunnel + SSH + Docker are up.

---

## 14. Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Hook: `npm: command not found` | Set `PATH` in `hooks/post-receive` or install Node system-wide for `git` |
| Hook: Docker permission denied | `usermod -aG docker git` and re-login / restart ssh session |
| GitHub push fails | Check PAT scope or deploy key **write**; test `sudo -u git git -C ... push github main` |
| Deploy uses wrong compose | Ensure `/var/lib/nodex/checkout` is on correct tag and has `.env` |
| Lock stuck | Remove stale `deploy.lock` only if no deploy is running |

---

## 15. Security notes

- Restrict `git` account: strong keys only, consider `AllowUsers git` in `sshd_config`.
- Protect `/home/git/.ssh` and any `.git-credentials` (`chmod 600`).
- Prefer **deploy keys** or **fine-grained PAT** scoped to one repo.
- Review Docker socket access: any user in `docker` is effectively root — split `deploy` user if you need stricter isolation later.

For a shorter overview of directories and users, see [SERVER-LAYOUT.md](SERVER-LAYOUT.md).
