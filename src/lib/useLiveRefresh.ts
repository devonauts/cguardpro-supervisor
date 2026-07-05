import { useEffect, useRef } from "react";
import { useNotifications } from "@/context/NotificationContext";

/**
 * Live-refresh a data screen when a relevant realtime event arrives. Today the
 * supervisor app only rang the bell on socket events while the Stations/Guards/
 * Incidents screens stayed stale until a manual pull-to-refresh. This subscribes
 * to the SAME realtime stream and reloads (debounced) when an event whose type
 * starts with one of `prefixes` lands.
 */
export function useLiveRefresh(reload: () => void, prefixes: string[]): void {
  const { lastEvent } = useNotifications();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastEvent?.type) return;
    if (!prefixes.some((p) => lastEvent.type.startsWith(p))) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => reloadRef.current(), 500); // collapse bursts
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);
}

export default useLiveRefresh;
