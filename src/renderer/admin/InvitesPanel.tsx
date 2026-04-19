import React from "react";
import { useSelector } from "react-redux";
import {
  createOrgInvite,
  listOrgInvites,
  revokeOrgInvite,
  type OrgInviteRow,
} from "../auth/auth-client";
import type { OrgRole } from "../auth/auth-session";
import type { RootState } from "../store";

const card = "rounded-md border border-border bg-background p-4 text-sm";
const heading = "mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const row =
  "flex items-center justify-between gap-2 border-b border-border/40 py-2 last:border-b-0";
const muted = "text-xs text-muted-foreground";
const btn =
  "rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-muted/30";
const btnDanger =
  "rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-700 hover:bg-red-500/20 dark:text-red-200";
const input =
  "flex-1 rounded-md border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

export function InvitesPanel(): React.ReactElement | null {
  const orgState = useSelector((s: RootState) => s.orgMembership);
  const activeOrg = orgState.orgs.find((o) => o.orgId === orgState.activeOrgId);
  const [invites, setInvites] = React.useState<OrgInviteRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [newEmail, setNewEmail] = React.useState("");
  const [newRole, setNewRole] = React.useState<OrgRole>("member");
  const [submitting, setSubmitting] = React.useState(false);
  const [createdInvite, setCreatedInvite] = React.useState<{
    email: string;
    token: string;
    expiresAt: string;
  } | null>(null);

  const orgId = orgState.activeOrgId;

  const refresh = React.useCallback(async (): Promise<void> => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const inv = await listOrgInvites(orgId);
      setInvites(inv);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!orgId || !activeOrg) {
    return (
      <div className={card}>
        <p className={muted}>No active organization.</p>
      </div>
    );
  }

  if (activeOrg.role !== "admin") {
    return (
      <div className={card}>
        <p className={muted}>Admin access required to manage invites.</p>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!orgId) return;
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createOrgInvite({
        orgId,
        email,
        role: newRole,
      });
      setCreatedInvite({
        email,
        token: result.token,
        expiresAt: result.expiresAt,
      });
      setNewEmail("");
      setNewRole("member");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(inviteId: string): Promise<void> {
    if (!orgId) return;
    setError(null);
    try {
      await revokeOrgInvite({ orgId, inviteId });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* silent */
    }
  }

  const pendingInvites = invites.filter((inv) => inv.status === "pending" && !isExpired(inv.expiresAt));
  const expiredInvites = invites.filter((inv) => inv.status === "pending" && isExpired(inv.expiresAt));
  const acceptedInvites = invites.filter((inv) => inv.status === "accepted");

  const inviteUrl = (token: string): string => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/invite/${encodeURIComponent(token)}`;
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className={card} aria-labelledby="invites-pending">
        <h2 id="invites-pending" className={heading}>
          Pending Invites ({pendingInvites.length})
        </h2>
        {loading ? <p className={muted}>Loading…</p> : null}
        {pendingInvites.length === 0 && !loading ? (
          <p className={muted}>No pending invites.</p>
        ) : null}
        {pendingInvites.map((inv) => (
          <div key={inv.inviteId} className={row}>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{inv.email}</div>
              <div className={muted}>
                {inv.role} · expires {formatDate(inv.expiresAt)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={btn}
                onClick={() => void copy(inviteUrl(inv.token))}
                title="Copy invite link to clipboard"
              >
                Copy link
              </button>
              <button
                type="button"
                className={btnDanger}
                onClick={() => void handleRevoke(inv.inviteId)}
              >
                Revoke
              </button>
            </div>
          </div>
        ))}

        {expiredInvites.length > 0 ? (
          <>
            <h3 className={`${heading} mt-4`}>Expired ({expiredInvites.length})</h3>
            {expiredInvites.map((inv) => (
              <div key={inv.inviteId} className={row}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-muted-foreground">
                    {inv.email}
                  </div>
                  <div className={muted}>
                    {inv.role} · expired {formatDate(inv.expiresAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className={btn}
                  onClick={() => void handleRevoke(inv.inviteId)}
                >
                  Remove
                </button>
              </div>
            ))}
          </>
        ) : null}

        {acceptedInvites.length > 0 ? (
          <>
            <h3 className={`${heading} mt-4`}>Accepted ({acceptedInvites.length})</h3>
            {acceptedInvites.slice(0, 5).map((inv) => (
              <div key={inv.inviteId} className={row}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-muted-foreground">
                    {inv.email}
                  </div>
                  <div className={muted}>
                    {inv.role} · accepted {inv.acceptedAt ? formatDate(inv.acceptedAt) : ""}
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : null}
      </section>

      <section className={card} aria-labelledby="invites-create">
        <h2 id="invites-create" className={heading}>
          Create Invite
        </h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Send an invitation to join this organization. If the user already exists, they will
          receive an in-app notification. Otherwise, share the invite link with them.
        </p>
        <form className="space-y-2" onSubmit={handleCreate}>
          <input
            type="email"
            required
            placeholder="email@company.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className={`${input} w-full`}
          />
          <div className="flex items-center gap-2">
            <select
              aria-label="Role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as OrgRole)}
              className={btn}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button type="submit" disabled={submitting} className={btn}>
              {submitting ? "Creating…" : "Create invite"}
            </button>
          </div>
        </form>

        {createdInvite ? (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px]">
            <p className="mb-1 font-medium text-emerald-800 dark:text-emerald-100">
              Invite created! 
              {invites.some(inv => inv.email === createdInvite.email && inv.status === "pending") 
                ? " If the user exists, they've been notified." 
                : " Share this link:"}
            </p>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-muted-foreground">Email:</span>
              <code className="flex-1 truncate">{createdInvite.email}</code>
            </div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-muted-foreground">Expires:</span>
              <code className="flex-1 truncate">{formatDate(createdInvite.expiresAt)}</code>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl(createdInvite.token)}
                className={`${input} w-full font-mono text-[10px]`}
              />
              <button
                type="button"
                className={btn}
                onClick={() => void copy(inviteUrl(createdInvite.token))}
              >
                Copy
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => setCreatedInvite(null)}
                title="Dismiss"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="lg:col-span-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[12px] text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}
