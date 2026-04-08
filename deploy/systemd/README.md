# Example systemd units

Copy and edit on your server; paths and user/group must match your install.

**Full server migration (Git + tunnel + hooks + deploy):** [../git-server/MIGRATION.md](../git-server/MIGRATION.md).

## Cloudflare Tunnel (`cloudflared`)

1. Authenticate once (as the user that will run the tunnel), e.g. `cloudflared tunnel login` and create the tunnel in the Cloudflare dashboard.
2. Copy [cloudflared.service.example](cloudflared.service.example) to `/etc/systemd/system/cloudflared.service` (or a drop-in).
3. Replace `YOUR_TUNNEL_UUID` and config path; set `User=` / `Group=` to a dedicated account if you use one.
4. `sudo systemctl daemon-reload && sudo systemctl enable --now cloudflared`

**`status=216/GROUP`:** The `Group=` in the unit does not exist on the system (or conflicts with `User=`). Use `Group=root` with `User=root`, or create the `cloudflared` group and user before using `User=cloudflared` / `Group=cloudflared`.

**`enable` warns about no `[Install]`:** The unit must include `WantedBy=multi-user.target` under `[Install]` (see the example file). Copy the full file, not an empty `[Install]` section.

## Docker

Use the distro package (`docker.io` or Docker CE) and enable `docker.service` so deploy hooks work after reboot.

## Nodex Docker stack (`nodex-docker-stack`)

Compose services use `restart: unless-stopped` in [../../docker-compose.yml](../../docker-compose.yml) so containers come back after a crash or Docker daemon restart without systemd.

To **start the stack on machine boot** (after a cold stop), use a oneshot unit that runs [../../scripts/docker-stack-boot.sh](../../scripts/docker-stack-boot.sh) once Docker is up:

1. Run **`npm run deploy`** at least once on the server so images exist (`docker-stack-boot.sh` uses `--no-build`).
2. Copy [nodex-docker-stack.service.example](nodex-docker-stack.service.example) to `/etc/systemd/system/nodex-docker-stack.service`.
3. Edit `WorkingDirectory=` and `ExecStart=` to your **absolute** checkout path (both must match).
4. Set **`NODEX_AUTH_JWT_SECRET`** in the repo `.env` or via `EnvironmentFile=` on the unit so logins survive container recreates (the full deploy script can generate one; this boot script does not).
5. `sudo systemctl daemon-reload && sudo systemctl enable --now nodex-docker-stack`

**Suggested order:** `docker.service` → `nodex-docker-stack` → `cloudflared` (tunnel). The stack unit `Requires=docker.service`.

**Stack layout:** `docker-stack-boot.sh` runs `docker compose up` for **nodex-api**, **nodex-web-blue**, and **nodex-gateway** (see [../ZERO-DOWNTIME.md](../ZERO-DOWNTIME.md)). WPN data lives in the mounted project directory (`data/nodex-workspace.json`). Hosts that keep **only green** as the live UI with blue stopped may need a custom compose invocation; the default gateway service depends on `nodex-web-blue`.

## SSH

Enable `ssh.service` (or `sshd.service`) so `git push` over your tunnel reaches `git-receive-pack`.
