import React from "react";
import { useSelector } from "react-redux";
import {
  createOrgInvite,
  listOrgInvites,
  listOrgMembers,
  removeOrgMember,
  revokeOrgInvite,
  setOrgMemberRole,
  type OrgInviteRow,
  type OrgMember,
} from "../auth/auth-client";
import type { OrgRole } from "../auth/auth-session";
import type { RootState } from "../store";

const card =
  "rounded-md border border-border bg-background p-4 text-sm";
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

/**
 * Slack-style People & Permissions: members on the left, pending invites on the right.
 * Admin-only — caller must gate by role before mounting.
 */
export function PeoplePanel(): React.ReactElement | null {
  const orgState = useSelector((s: RootState) => s.orgMembership);
  const activeOrg = orgState.orgs.find((o) => o.orgId === orgState.activeOrgId);
  const [members, setMembers] = React.useState<OrgMember[]>([]);
  const [invites, setInvites] = React.useState<OrgInviteRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<OrgRole>("member");
  const [lastInviteToken, setLastInviteToken] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const orgId = orgState.activeOrgId;
  const refresh = React.useCallback(async (): Promise<void> => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [m, i] = await Promise.all([
        listOrgMembers(orgId),
        listOrgInvites(orgId),
      ]);
      setMembers(m);
      setInvites(i);
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
        <p className={muted}>Admin access required to manage people.</p>
      </div>
    );
  }

  async function handleInvite(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!orgId) return;
    if (!inviteEmail.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await createOrgInvite({
        orgId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setLastInviteToken(r.token);
      setInviteEmail("");
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

  async function handleRoleChange(userId: string, role: OrgRole): Promise<void> {
    if (!orgId) return;
    setError(null);
    try {
      await setOrgMemberRole({ orgId, userId, role });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRemove(userId: string): Promise<void> {
    if (!orgId) return;
    setError(null);
    try {
      await removeOrgMember({ orgId, userId });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function copyInviteLink(token: string): void {
    const url = `${window.location.origin}/invite/${encodeURIComponent(token)}`;
    void navigator.clipboard?.writeText(url);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className={card} aria-labelledby="people-members">
        <h2 id="people-members" className={heading}>
          Members ({members.length})
        </h2>
        {loading ? <p className={muted}>Loading…</p> : null}
        {members.map((m) => (
          <div key={m.userId} className={row}>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {m.displayName ?? m.email}
              </div>
              <div className={muted}>
                {m.email}
                {m.mustSetPassword ? " · pending password" : ""}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <select
                aria-label="Role"
                value={m.role}
                onChange={(e) => {
                  void handleRoleChange(m.userId, e.target.value as OrgRole);
                }}
                className={btn}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="button"
                className={btnDanger}
                onClick={() => {
                  void handleRemove(m.userId);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className={card} aria-labelledby="people-invites">
        <h2 id="people-invites" className={heading}>
          Pending invites ({invites.filter((i) => i.status === "pending").length})
        </h2>
        <form className="mb-3 flex flex-wrap items-center gap-2" onSubmit={handleInvite}>
          <input
            type="email"
            required
            placeholder="email@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className={input}
          />
          <select
            aria-label="Invite role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as OrgRole)}
            className={btn}
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" disabled={submitting} className={btn}>
            {submitting ? "Sending…" : "Invite"}
          </button>
        </form>
        {lastInviteToken ? (
          <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px]">
            <p className="mb-1 font-medium text-emerald-800 dark:text-emerald-100">
              Invite created — copy the link:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-[11px]">
                {`${window.location.origin}/invite/${lastInviteToken}`}
              </code>
              <button
                type="button"
                className={btn}
                onClick={() => copyInviteLink(lastInviteToken)}
              >
                Copy
              </button>
            </div>
          </div>
        ) : null}
        {invites.length === 0 ? (
          <p className={muted}>No invites yet.</p>
        ) : (
          invites.map((i) => (
            <div key={i.inviteId} className={row}>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{i.email}</div>
                <div className={muted}>
                  {i.role} · {i.status}
                </div>
              </div>
              {i.status === "pending" ? (
                <button
                  type="button"
                  className={btnDanger}
                  onClick={() => {
                    void handleRevoke(i.inviteId);
                  }}
                >
                  Revoke
                </button>
              ) : null}
            </div>
          ))
        )}
      </section>

      {error ? (
        <div className="lg:col-span-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[12px] text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}
