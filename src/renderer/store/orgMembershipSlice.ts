import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { createOrg, listMyOrgs, setActiveOrgRemote } from "../auth/auth-client";
import { setActiveOrgId, setActiveSpaceId, type AuthUserOrg } from "../auth/auth-session";

const STALE_AFTER_MS = 60_000;

export type OrgMembershipState = {
  orgs: AuthUserOrg[];
  activeOrgId: string | null;
  defaultOrgId: string | null;
  /** When set, the current user cannot create new orgs (admin-provisioned account). */
  lockedOrgId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  loadedAt: number | null;
  error: string | null;
};

const initialState: OrgMembershipState = {
  orgs: [],
  activeOrgId: null,
  defaultOrgId: null,
  lockedOrgId: null,
  status: "idle",
  loadedAt: null,
  error: null,
};

export const loadMyOrgsThunk = createAsyncThunk(
  "orgMembership/load",
  async () => listMyOrgs(),
);

export const switchActiveOrgThunk = createAsyncThunk<
  { activeOrgId: string },
  { orgId: string }
>(
  "orgMembership/switch",
  async ({ orgId }) => {
    await setActiveOrgRemote(orgId);
    return { activeOrgId: orgId };
  },
);

export const createOrgThunk = createAsyncThunk<
  { orgId: string; name: string },
  { name: string }
>("orgMembership/create", async ({ name }, { dispatch }) => {
  const r = await createOrg({ name });
  await dispatch(loadMyOrgsThunk());
  return { orgId: r.orgId, name: r.name };
});

const slice = createSlice({
  name: "orgMembership",
  initialState,
  reducers: {
    /** Reset on logout. */
    clearOrgMembership(): OrgMembershipState {
      return initialState;
    },
    /** Local-only override (e.g. after invite-accept) without round-trip. */
    setLocalActiveOrg(
      state,
      action: PayloadAction<{ orgId: string }>,
    ): void {
      state.activeOrgId = action.payload.orgId;
      setActiveOrgId(action.payload.orgId);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadMyOrgsThunk.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadMyOrgsThunk.fulfilled, (state, action) => {
        state.status = "ready";
        state.loadedAt = Date.now();
        state.orgs = action.payload.orgs;
        state.activeOrgId = action.payload.activeOrgId;
        state.defaultOrgId = action.payload.defaultOrgId;
        state.lockedOrgId = action.payload.lockedOrgId ?? null;
        if (action.payload.activeOrgId) {
          setActiveOrgId(action.payload.activeOrgId);
        } else if (action.payload.defaultOrgId) {
          setActiveOrgId(action.payload.defaultOrgId);
        }
      })
      .addCase(loadMyOrgsThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message ?? "Failed to load orgs";
      })
      .addCase(switchActiveOrgThunk.fulfilled, (state, action) => {
        state.activeOrgId = action.payload.activeOrgId;
        // Clear space ID; spaceMembershipSlice will load and set the default space for the new org
        setActiveSpaceId(null);
        // Dispatch WPN tree changed event to trigger data refresh (deferred to avoid reducer dispatch issue)
        if (typeof window !== "undefined") {
          setTimeout(() => {
            window.dispatchEvent(new Event("nodex:wpn-tree-changed"));
          }, 0);
        }
      });
  },
});

export const { clearOrgMembership, setLocalActiveOrg } = slice.actions;
export default slice.reducer;

export function isOrgMembershipStale(state: OrgMembershipState): boolean {
  if (state.status !== "ready" || state.loadedAt === null) {
    return true;
  }
  return Date.now() - state.loadedAt > STALE_AFTER_MS;
}
