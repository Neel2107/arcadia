import { useEffect, useMemo, useRef } from "react";
import { useShowsNoPage } from "../../state/windows/hooks";
import { noteSidebarNoPagePeek } from "../../state/telemetry/usage";

type Peek = { show: () => void; hide: () => void };

export function noPagePeekReason() {
  let asked = false;
  return {
    ask: (noPage: boolean) => void (asked = noPage),
    opened: () => {
      if (asked) noteSidebarNoPagePeek();
      asked = false;
    },
    byHand: () => void (asked = false),
  };
}

export function useNoPagePeek(windowId: string, enabled: boolean, peek: { current: Peek }) {
  const noPage = useShowsNoPage(windowId);
  const noPageNow = useRef(noPage);
  noPageNow.current = noPage;
  const reason = useMemo(noPagePeekReason, []);
  useEffect(() => {
    if (!enabled) return;
    reason.ask(noPage);
    if (noPage) peek.current.show();
    else peek.current.hide();
  }, [noPage, enabled]);
  return useMemo(() => ({ ...reason, held: () => noPageNow.current }), [reason]);
}
