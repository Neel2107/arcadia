import type { BrowserState, HydrateData } from "../../browser/src/state/browser/store";
import type { BrowserWindow, Profile, Tab } from "../../browser/src/state/browser/types";
import type { ArdiaHost } from "./host";
import { activeTabId, isIncognitoProfile } from "../../browser/src/state/browser/model";
import { adoptOf, navigationOf } from "../../browser/src/state/tabs/pageSession";

export type SmallWindowSeed = { window: BrowserWindow; tabs: Record<string, Tab>; profile: Profile; at: number };
export type SeedStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
type Frame = [number, number, number, number];
export type ScreenArea = { width: number; height: number; availLeft: number; availTop: number; availWidth: number; availHeight: number };

export const SMALL_WINDOW_SEED_PREFIX = "ardia.smallWindow.";
export const SMALL_WINDOW_SEED_LIFE = 60_000;
export const SMALL_WINDOW_MIN_SIZE: [number, number] = [420, 300];
const SEED_LIMIT = 1024 * 1024;

const seedStorage = (): SeedStorage | undefined => {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

export function smallWindowSeed(state: Pick<BrowserState, "windows" | "tabs" | "profiles">, id: string, now = Date.now()): SmallWindowSeed | undefined {
  const w = state.windows[id];
  const profile = w && state.profiles[w.profileId];
  if (w?.kind !== "small" || !profile || isIncognitoProfile(w.profileId)) return undefined;
  const tabs: Record<string, Tab> = {};
  for (const tabId of w.tabIds) {
    const tab = state.tabs[tabId];
    if (tab && tab.windowId === id && !isIncognitoProfile(tab.profileId)) tabs[tabId] = tab;
  }
  return { window: { ...w, tabIds: w.tabIds.filter((tabId) => tabs[tabId]) }, tabs, profile, at: now };
}

function expiredSeeds(storage: SeedStorage, now: number): string[] {
  const expired: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(SMALL_WINDOW_SEED_PREFIX)) continue;
    const at = parsedSeed(storage.getItem(key))?.at;
    if (at === undefined || now - at > SMALL_WINDOW_SEED_LIFE || at > now + SMALL_WINDOW_SEED_LIFE) expired.push(key);
  }
  return expired;
}

function parsedSeed(text: string | null): SmallWindowSeed | undefined {
  if (!text || text.length > SEED_LIMIT) return undefined;
  try {
    const seed = JSON.parse(text) as SmallWindowSeed | null;
    return seed && typeof seed === "object" && typeof seed.at === "number" && seed.window && typeof seed.window === "object" && seed.tabs && typeof seed.tabs === "object" && seed.profile && typeof seed.profile === "object" ? seed : undefined;
  } catch {
    return undefined;
  }
}

export function offerSmallWindow(seed: SmallWindowSeed, storage: SeedStorage | undefined = seedStorage()): boolean {
  if (!storage) return false;
  try {
    for (const key of expiredSeeds(storage, seed.at)) storage.removeItem(key);
    const text = JSON.stringify(seed);
    if (text.length > SEED_LIMIT) return false;
    storage.setItem(SMALL_WINDOW_SEED_PREFIX + seed.window.id, text);
    return true;
  } catch {
    return false;
  }
}

export function withdrawSmallWindow(id: string, storage: SeedStorage | undefined = seedStorage()) {
  try {
    storage?.removeItem(SMALL_WINDOW_SEED_PREFIX + id);
  } catch {
    return;
  }
}

export function takeSmallWindow(windowId: string, storage: SeedStorage | undefined = seedStorage(), now = Date.now()): SmallWindowSeed | undefined {
  if (!storage) return undefined;
  try {
    const key = SMALL_WINDOW_SEED_PREFIX + windowId;
    const seed = parsedSeed(storage.getItem(key));
    storage.removeItem(key);
    if (!seed || Math.abs(now - seed.at) > SMALL_WINDOW_SEED_LIFE) return undefined;
    const w = seed.window;
    if (w.id !== windowId || w.kind !== "small" || typeof w.profileId !== "string" || isIncognitoProfile(w.profileId) || seed.profile.id !== w.profileId || !Array.isArray(w.tabIds)) return undefined;
    return seed;
  } catch {
    return undefined;
  }
}

export function withSmallWindow(host: ArdiaHost, session: HydrateData, storage?: SeedStorage, now = Date.now()): HydrateData | undefined {
  const { windowId, startup, pageProfile, privateWindow } = host.bootstrap;
  if (startup !== false || privateWindow || (pageProfile && isIncognitoProfile(pageProfile)) || session.windows?.[windowId]) return undefined;
  const seed = storage ? takeSmallWindow(windowId, storage, now) : takeSmallWindow(windowId, undefined, now);
  if (!seed) return undefined;
  const w = seed.window;
  const tabs = Object.fromEntries(Object.entries(seed.tabs)
    .filter(([id, tab]) => tab?.id === id && tab.windowId === windowId && typeof tab.profileId === "string" && !isIncognitoProfile(tab.profileId) && !session.tabs?.[id]));
  const tabIds = w.tabIds.filter((id) => tabs[id]);
  if (!tabIds.length) return undefined;
  const activeTabIds = Object.fromEntries(Object.entries(w.activeTabIds ?? {}).filter(([, id]) => tabs[id]));
  return {
    ...session,
    profiles: { ...session.profiles, [w.profileId]: session.profiles?.[w.profileId] ?? seed.profile },
    profileOrder: [...new Set([...(session.profileOrder ?? []), w.profileId])],
    windows: { ...session.windows, [windowId]: { ...w, tabIds, activeTabIds } },
    windowOrder: [...new Set([...(session.windowOrder ?? []), windowId])],
    tabs: { ...session.tabs, ...tabs },
    focusedWindowId: windowId,
  };
}

export function smallWindowFrame(size: unknown, screen: ScreenArea): Frame | undefined {
  const [wanted, tall] = Array.isArray(size) && size.length === 2 && size.every((v) => typeof v === "number" && Number.isFinite(v)) ? size as [number, number] : [900, 640];
  if (!(screen.availWidth > 0) || !(screen.availHeight > 0)) return undefined;
  const width = Math.round(Math.min(Math.max(wanted, SMALL_WINDOW_MIN_SIZE[0]), screen.availWidth));
  const height = Math.round(Math.min(Math.max(tall, SMALL_WINDOW_MIN_SIZE[1]), screen.availHeight));
  const lift = Math.min(screen.availHeight * 0.05, (screen.availHeight - height) / 2);
  const left = Math.round(screen.availLeft + (screen.availWidth - width) / 2);
  const top = Math.round(screen.availTop + (screen.availHeight - height) / 2 - lift);
  return [left, screen.height - (top + height), width, height];
}

export function opensOnCommandBar(state: Pick<BrowserState, "windows" | "tabs" | "ui">, windowId: string): boolean {
  if (state.windows[windowId]?.kind !== "small") return false;
  const tabId = activeTabId(state as BrowserState, windowId);
  const tab = tabId ? state.tabs[tabId] : undefined;
  return !!tab && !tab.url && !navigationOf(tab) && !adoptOf(tab);
}
