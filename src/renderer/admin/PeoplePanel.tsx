import React from "react";
import { useSelector } from "react-redux";
import {
  createOrgMember,
  listOrgMembers,
  removeOrgMember,
  resetOrgMemberPassword,
  setOrgMemberRole,
  type OrgMember,
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

/** ~16 hex chars = ~64 bits of entropy. Enough for a temp password the admin copies once. */
function generateTempPassword(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 16);
}

type CreatedCredential = {
  email: string;
  password: string;
};

type ResetCredential = {
  userId: string;
  email: string;
  password: string;
};

export function PeoplePanel(): React.ReactElement | null {
  const orgState = useSelector((s: RootState) => s.orgMembership);
  const activeOrg = orgState.orgs.find((o) => o.orgId === orgState.activeOrgId);
  const [members, setMembers] = React.useState<OrgMember[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Create-member form
  const [newEmail, setNewEmail] = React.useState("");
  const [newPassword, setNewPassword] = React.useState(() => generateTempPassword());
  const [newRole, setNewRole] = React.useState<OrgRole>("member");
  const [submitting, setSubmitting] = React.useState(false);
  const [createdCred, setCreatedCred] = React.useState<CreatedCredential | null>(null);

  // Per-member reset-password dialog
  const [resetForUserId, setResetForUserId] = React.useState<string | null>(null);
  const [resetPassword, setResetPassword] = React.useState("");
  const [resetSubmitting, setResetSubmitting] = React.useState(false);
  const [resetCred, setResetCred] = React.useState<ResetCredential | null>(null);

  const orgId = orgState.activeOrgId;
  const refresh = React.useCallback(async (): Promise<void> => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const m = await listOrgMembers(orgId);
      setMembers(m);
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

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!orgId) return;
    const email = newEmail.trim().toLowerCase();
    if (!email || newPassword.length < 8) return;
    setSubmitting(true);
    setError(null);
    try {
      await createOrgMember({
        orgId,
        email,
        password: newPassword,
        role: newRole,
      });
      setCreatedCred({ email, password: newPassword });
      setNewEmail("");
      setNewPassword(generateTempPassword());
      setNewRole("member");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
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

  function openResetDialog(userId: string): void {
    setResetForUserId(userId);
    setResetPassword(generateTempPassword());
    setResetCred(null);
  }

  function closeResetDialog(): void {
    setResetForUserId(null);
    setResetPassword("");
  }

  async function handleResetSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!orgId || !resetForUserId) return;
    if (resetPassword.length < 8) return;
    const member = members.find((m) => m.userId === resetForUserId);
    if (!member) return;
    setResetSubmitting(true);
    setError(null);
    try {
      await resetOrgMemberPassword({
        orgId,
        userId: resetForUserId,
        password: resetPassword,
      });
      setResetCred({
        userId: resetForUserId,
        email: member.email,
        password: resetPassword,
      });
      setResetForUserId(null);
      setResetPassword("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResetSubmitting(false);
    }
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* silent */
    }
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
                {m.mustSetPassword ? " · must set password" : ""}
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
                className={btn}
                onClick={() => openResetDialog(m.userId)}
                title="Generate a new temporary password for this member"
              >
                Reset password
              </button>
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

      <section className={card} aria-labelledby="people-create">
        <h2 id="people-create" className={heading}>
          Add member
        </h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Create a member with a temporary password. They will be required to set a new password
          on first login. Share the password with them privately — it is displayed only once.
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
            <input
              type="text"
              required
              minLength={8}
              placeholder="Temporary password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={`${input} w-full font-mono`}
            />
            <button
              type="button"
              className={btn}
              onClick={() => setNewPassword(generateTempPassword())}
              title="Generate a new random temporary password"
            >
              Generate
            </button>
          </div>
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
              {submitting ? "Creating…" : "Create member"}
            </button>
          </div>
        </form>
        {createdCred ? (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px]">
            <p className="mb-1 font-medium text-emerald-800 dark:text-emerald-100">
              Member created — copy the temporary password now:
            </p>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-muted-foreground">Email:</span>
              <code className="flex-1 truncate">{createdCred.email}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Password:</span>
              <code className="flex-1 truncate font-mono">{createdCred.password}</code>
              <button
                type="button"
                className={btn}
                onClick={() => void copy(createdCred.password)}
              >
                Copy
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => setCreatedCred(null)}
                title="Dismiss — the password will no longer be shown"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {resetForUserId ? (
          <div className="mt-3 rounded-md border border-border bg-muted/20 p-2 text-[11px]">
            <p className="mb-2 font-medium text-foreground">
              Reset password for {members.find((m) => m.userId === resetForUserId)?.email}
            </p>
            <form className="space-y-2" onSubmit={handleResetSubmit}>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  minLength={8}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className={`${input} w-full font-mono`}
                />
                <button
                  type="button"
                  className={btn}
                  onClick={() => setResetPassword(generateTempPassword())}
                >
                  Generate
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={resetSubmitting} className={btn}>
                  {resetSubmitting ? "Saving…" : "Set temporary password"}
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={closeResetDialog}
                  disabled={resetSubmitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {resetCred ? (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px]">
            <p className="mb-1 font-medium text-emerald-800 dark:text-emerald-100">
              Password reset — share the new temporary password privately:
            </p>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-muted-foreground">Email:</span>
              <code className="flex-1 truncate">{resetCred.email}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Password:</span>
              <code className="flex-1 truncate font-mono">{resetCred.password}</code>
              <button
                type="button"
                className={btn}
                onClick={() => void copy(resetCred.password)}
              >
                Copy
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => setResetCred(null)}
                title="Dismiss — the password will no longer be shown"
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
