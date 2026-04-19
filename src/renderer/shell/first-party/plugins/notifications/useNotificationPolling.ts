import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../../store";
import { loadUnreadCountThunk } from "../../../../store/notificationSlice";

const POLL_INTERVAL_MS = 30000; // 30 seconds

export function useNotificationPolling(): void {
  const dispatch = useDispatch<AppDispatch>();
  const cloudAuth = useSelector((s: RootState) => s.cloudAuth);

  useEffect(() => {
    // Only poll if user is signed in AND has a valid userId
    if (cloudAuth.status !== "signedIn" || !cloudAuth.userId) {
      return;
    }

    void dispatch(loadUnreadCountThunk());

    const interval = setInterval(() => {
      void dispatch(loadUnreadCountThunk());
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [dispatch, cloudAuth.status, cloudAuth.userId]);
}
