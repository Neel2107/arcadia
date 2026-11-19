import type { OutsidePressEvent } from "../../platform/windows";
import { storeAction, useBrowser } from "../browser/store";
import { noteDownloadsPanel } from "../telemetry/downloadsPanelCounts";
import { activeTabId } from "../browser/model";
import { httpPagesPort } from "../../platform/launchConfig";

export const toggleSidebar = storeAction("toggleSidebar");
export const restoreClosed = storeAction("restoreClosed");
export const openPanel = storeAction("openPanel");
export const closePanel = storeAction("closePanel");
export const setDownloadsOpen = storeAction("setDownloadsOpen");
export const setFind = storeAction("setFind");
export const returnRefusedMove = storeAction("returnRefusedMove");
export const removeDownload = storeAction("removeDownload");
export const clearDownloads = storeAction("clearDownloads");

let downloadsPressedAway: { windowId: string; pressedAt: number } | null = null;

export function dismissDownloadsByPress(windowId: string, press: OutsidePressEvent) {
  if (!useBrowser.getState().windowUi[windowId]?.downloadsOpen) return;
  const pressedAt = press.nativeEvent.timestamp;
  downloadsPressedAway = pressedAt === undefined ? null : { windowId, pressedAt };
  setDownloadsOpen(windowId, false);
  noteDownloadsPanel("pressClose");
}

function downloadsClosedByThisPress(windowId: string, pressedAt: number | undefined) {
  const away = downloadsPressedAway;
  downloadsPressedAway = null;
  return pressedAt !== undefined && away?.windowId === windowId && away.pressedAt === pressedAt;
}

export function toggleDownloadsOpen(windowId: string, pressedAt?: number) {
  if (downloadsClosedByThisPress(windowId, pressedAt)) return;
  setDownloadsOpen(windowId, !useBrowser.getState().windowUi[windowId]?.downloadsOpen);
}

export function windowShowsPage(windowId: string) {
  const s = useBrowser.getState();
  const active = activeTabId(s, windowId);
  return !!active && !!s.tabs[active]?.url;
}

export function openCheckPage(windowId: string) {
  const port = httpPagesPort();
  return useBrowser.getState().newTab(windowId, { url: port ? `http://127.0.0.1:${port}/a` : "about:blank" });
}

export function closeCheckPage(tabId: string) {
  if (useBrowser.getState().tabs[tabId]) useBrowser.getState().closeTab(tabId);
}
