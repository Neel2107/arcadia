import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.__DEV__ = false;
const { useBrowser } = await import("../browser/store.ts");
const model = await import("../browser/model.ts");
const { cancelSwitcher, commitSwitcher, moveSwitcher, switcherStep } = await import("./switcher.ts");
const { sidebarUi } = await import("./sidebarUi.ts");
const { DEFAULT_SETTINGS, parseSettings, SETTING_SPECS } = await import("../settings/settings.ts");
const { isConfigSettingKey } = await import("../settings/configAllowlist.ts");
const { settingsSnapshot } = await import("../telemetry/settingsSnapshot.ts");

const S = () => useBrowser.getState();

function windowWith(...urls) {
  S().hydrate({});
  S().updateSettings({ newTabPosition: "bottom" });
  const w = S().createWindow({ url: `https://${urls[0]}.com/` });
  const ids = [model.viewTabIds(S(), w)[0], ...urls.slice(1).map((u) => S().newTab(w, { url: `https://${u}.com/`, background: true }))];
  return [w, ...ids];
}

function used(order) {
  let at = Date.now() - 60_000;
  for (const id of order) S().updateTab(id, { lastActiveAt: (at += 1000), unseen: false });
}

test("by default the switcher lists tabs by recent use and steps to the one used before", () => {
  const [w, a, b, c, d] = windowWith("a", "b", "c", "d");
  used([b, d, c, a]);
  S().activate(a);
  switcherStep(w, false);
  const { ids, index } = sidebarUi().switcher;
  assert.deepEqual(ids, [a, c, d, b]);
  assert.equal(index, 1);
  cancelSwitcher();
});

test("with the setting on, the switcher lists tabs in tab-bar order and steps to the neighbour, wrapping at both ends", () => {
  const [w, a, b, c, d] = windowWith("a", "b", "c", "d");
  S().updateSettings({ tabSwitcherByPosition: true });
  used([b, d, c, a]);
  S().activate(c);
  switcherStep(w, false);
  assert.deepEqual(sidebarUi().switcher.ids, [a, b, c, d]);
  assert.equal(sidebarUi().switcher.index, 3);
  moveSwitcher(1);
  assert.equal(sidebarUi().switcher.index, 0, "forward from the last tab wraps to the first");
  commitSwitcher();
  assert.equal(model.activeTabId(S(), w), a);
  switcherStep(w, true);
  assert.equal(sidebarUi().switcher.index, 3, "backward from the first tab wraps to the last");
  commitSwitcher();
  assert.equal(model.activeTabId(S(), w), d);
  S().activate(b);
  switcherStep(w, true);
  assert.equal(sidebarUi().switcher.index, 0);
  cancelSwitcher();
  assert.equal(model.activeTabId(S(), w), b, "cancelling leaves the tab alone");
});

test("the setting is off by default, synced, allowed in config files and in the daily settings snapshot", () => {
  assert.equal(DEFAULT_SETTINGS.tabSwitcherByPosition, false);
  assert.equal(SETTING_SPECS.tabSwitcherByPosition.synced, true);
  assert.ok(isConfigSettingKey("tabSwitcherByPosition"));
  assert.equal(parseSettings({ tabSwitcherByPosition: true }).tabSwitcherByPosition, true);
  assert.equal(parseSettings({ tabSwitcherByPosition: "yes" }).tabSwitcherByPosition, false);
  assert.equal(settingsSnapshot(parseSettings({ tabSwitcherByPosition: true })).setting_tabSwitcherByPosition, "true");
});
