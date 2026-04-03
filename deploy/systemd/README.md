# Example systemd units

Copy and edit on your server; paths and user/group must match your install.

**Full server migration (Git + tunnel + hooks + deploy):** [../git-server/MIGRATION.md](../git-server/MIGRATION.md).

## Cloudflare Tunnel (`cloudflared`)

1. Authenticate once (as the user that will run the tunnel), e.g. `cloudflared tunnel login` and create the tunnel in the Cloudflare dashboard.
2. Copy [cloudflared.service.example](cloudflared.service.example) to `/etc/systemd/system/cloudflared.service` (or a drop-in).
3. Replace `YOUR_TUNNEL_UUID` and config path; set `User=` / `Group=` to a dedicated account if you use one.
4. `sudo systemctl daemon-reload && sudo systemctl enable --now cloudflared`

## Docker

Use the distro package (`docker.io` or Docker CE) and enable `docker.service` so deploy hooks work after reboot.

## SSH

Enable `ssh.service` (or `sshd.service`) so `git push` over your tunnel reaches `git-receive-pack`.
