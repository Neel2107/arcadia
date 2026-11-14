import type { ArdiaHost } from "./host";
import { hostSupports } from "./host.ts";

export const TAB_SHARE_EVENT = "media.tabShare";
export type TabShareNote = (capturerTabId: string, capturedTabId: string, origin: string) => void;

export function watchTabShares(host: ArdiaHost, note: TabShareNote) {
  if (!hostSupports(TAB_SHARE_EVENT, host)) return () => {};
  return host.onEvent((module, event, payload) => {
    if (module !== "ArdiaMedia" || event !== "media") return;
    const { name, data } = (payload ?? {}) as { name?: unknown; data?: { capturer?: unknown; captured?: unknown; origin?: unknown } | null };
    if (name !== TAB_SHARE_EVENT || typeof data?.capturer !== "string" || typeof data.captured !== "string") return;
    note(data.capturer, data.captured, typeof data.origin === "string" ? data.origin : "");
  });
}
