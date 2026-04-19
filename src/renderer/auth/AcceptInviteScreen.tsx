import React from "react";
import { useDispatch } from "react-redux";
import {
  acceptInvite,
  previewInvite,
  type OrgInvitePreview,
} from "./auth-client";
import type { AppDispatch } from "../store";
import { loadMyOrgsThunk } from "../store/orgMembershipSlice";

const card =
  "mx-auto mt-12 w-full max-w-md rounded-md border border-border bg-background p-6 text-sm shadow-sm";
const heading = "mb-1 text-lg font-semibold";
const sub = "mb-4 text-xs text-muted-foreground";
const label = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const input =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
const submitBtn =
  "mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";

export type AcceptInviteScreenProps = {
  /** Invite token from `/invite/:token` deep link. */
  token: string;
  /** Called after success so the host can route to the post-auth shell. */
  onAccepted?: (result: { orgId: string; userId: string }) => void;
};

export function AcceptInviteScreen({
  token,
  onAccepted,
}: AcceptInviteScreenProps): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const [preview, setPreview] = React.useState<OrgInvitePreview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState<{ orgId: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    previewInvite(token)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await acceptInvite({
        token,
        password: preview.needsPassword ? password : undefined,
        displayName: displayName.trim() || undefined,
      });
      setDone({ orgId: r.orgId });
      void dispatch(loadMyOrgsThunk());
      onAccepted?.({ orgId: r.orgId, userId: r.userId });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={card}>
        <p className="text-muted-foreground">Looking up invite…</p>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className={card}>
        <h1 className={heading}>Invite not valid</h1>
        <p className="text-red-600 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className={card}>
        <h1 className={heading}>Welcome aboard</h1>
        <p className={sub}>
          You're now a member of {preview?.orgName}. Continue to the workspace.
        </p>
      </div>
    );
  }

  if (!preview) {
    return <div className={card}>(no invite)</div>;
  }

  return (
    <div className={card}>
      <h1 className={heading}>Join {preview.orgName}</h1>
      <p className={sub}>
        You were invited as a <strong>{preview.role}</strong> for{" "}
        <strong>{preview.email}</strong>.
      </p>
      <form onSubmit={handleSubmit}>
        {preview.needsPassword ? (
          <>
            <label className={label}>
              Choose a password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
            </label>
            <label className={`${label} mt-3`}>
              Display name (optional)
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={input}
              />
            </label>
          </>
        ) : (
          <p className={sub}>You already have an account — accepting will add you to this org.</p>
        )}
        <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
          <p style={{ marginBottom: '12px', fontSize: '14px', fontWeight: '600', color: '#333' }}>
            Click the button below to accept the invitation:
          </p>
          <button 
            type="submit" 
            disabled={submitting}
            style={{
              width: '100%',
              backgroundColor: submitting ? '#999' : '#0066ff',
              color: 'white',
              padding: '14px 24px',
              border: 'none',
              borderRadius: '8px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              boxShadow: '0 2px 8px rgba(0, 102, 255, 0.3)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!submitting) {
                e.currentTarget.style.backgroundColor = '#0052cc';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!submitting) {
                e.currentTarget.style.backgroundColor = '#0066ff';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {submitting ? "Joining…" : `Join ${preview.orgName}`}
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-xs text-red-600 dark:text-red-300">{error}</p>
        ) : null}
      </form>
    </div>
  );
}
