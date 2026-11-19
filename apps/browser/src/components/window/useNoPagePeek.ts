import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import { useShowsNoPage } from "../../state/windows/hooks";
import { noteSidebarNoPagePeek } from "../../state/telemetry/usage";

type Peek = { live: boolean; show: () => void; hide: () => void };

export function noPagePeekReason() {
  let asked = false;
  let wanted = false;
  return {
    ask: (noPage: boolean) => void ((asked = noPage), (wanted = noPage)),
    opened: () => {
      if (asked) noteSidebarNoPagePeek();
      asked = false;
    },
    byHand: () => void (asked = false),
    activated: (show: () => void) => {
      if (!wanted) return;
      asked = true;
      show();
    },
  };
}

export function useNoPagePeek(windowId: string, enabled: boolean, peek: { current: Peek }) {
  const noPage = useShowsNoPage(windowId);
  const noPageNow = useRef(noPage);
  noPageNow.current = noPage;
  const reason = useMemo(noPagePeekReason, []);
  useEffect(() => {
    reason.ask(enabled && noPage);
    if (!enabled) return;
    if (noPage) peek.current.show();
    else peek.current.hide();
  }, [noPage, enabled]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => state === "active" && !peek.current.live && reason.activated(() => peek.current.show()));
    return () => sub.remove();
  }, [reason]);
  return useMemo(() => ({ ...reason, held: () => noPageNow.current }), [reason]);
}
