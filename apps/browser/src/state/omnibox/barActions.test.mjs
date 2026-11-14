import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.__DEV__ = false;
const { useBrowser } = await import("../browser/store.ts");
const { tabLayoutOf } = await import("../browser/model.ts");
const { barActions } = await import("./barActions.ts");
const { runBarAction } = await import("./runBar.ts");
const { takeTabLayoutCounts } = await import("../telemetry/tabLayoutCounts.ts");

const S = () => useBrowser.getState();
const layoutAction = (w) => barActions(S(), w).find((a) => a.id === "toggleTabLayout");

test("the command bar's layout switch names the layout it switches to, and switching from it is counted", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://start.example/" });
  takeTabLayoutCounts();
  assert.equal(tabLayoutOf(S(), w), "sidebar");
  assert.equal(layoutAction(w)?.title, "Switch to Top Tabs");
  assert.ok(layoutAction(w)?.keywords?.includes("top tabs"));

  runBarAction("toggleTabLayout", w);
  assert.equal(tabLayoutOf(S(), w), "top");
  assert.equal(S().settings.tabLayout, "top");
  assert.equal(layoutAction(w)?.title, "Switch to Sidebar Tabs");

  runBarAction("toggleTabLayout", w);
  assert.equal(tabLayoutOf(S(), w), "sidebar");
  assert.deepEqual(takeTabLayoutCounts(), { tab_layout_switches_to_top: 1, tab_layout_switches_to_sidebar: 1 });
});

test("Little Ardia's command bar leaves out the layout switch and the other commands its menus disable", () => {
  S().hydrate({});
  const main = S().createWindow({ url: "https://main.example/" });
  const little = S().createWindow({ kind: "small", url: "https://little.example/" });
  assert.ok(layoutAction(main));
  assert.equal(layoutAction(little), undefined);
  const ids = barActions(S(), little).map((a) => a.id);
  for (const command of ["closeAllTabs", "toggleSidebar"]) assert.ok(!ids.includes(command), command);
  assert.ok(ids.includes("reload"));
});
