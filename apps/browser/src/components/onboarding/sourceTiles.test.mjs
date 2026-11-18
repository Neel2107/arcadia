import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sourceTiles } from "./sourceTiles.ts";
import { PLATFORM_FEATURES as MAC } from "../../lib/platformFeatures.ts";
import { PLATFORM_FEATURES as WINDOWS } from "../../lib/platformFeatures.windows.ts";

const summary = (tiles) => tiles.map((t) => [t.id, t.name, t.found, t.app, t.importId ?? null]);

test("on the Mac a tile is found by its app bundle and keeps the app's path for its icon", () => {
  const installed = new Set(["/Applications/Google Chrome.app", "/Applications/Microsoft Edge Beta.app"]);
  assert.deepEqual(summary(sourceTiles((c) => installed.has(c.app), MAC)), [
    ["arc", "Arc", false, null, null],
    ["dia", "Dia", false, null, null],
    ["chrome", "Chrome", true, "/Applications/Google Chrome.app", null],
    ["safari", "Safari", false, null, null],
    ["firefox", "Firefox", false, null, null],
    ["zen", "Zen", false, null, null],
    ["edge", "Edge Beta", true, "/Applications/Microsoft Edge Beta.app", "edgeBeta"],
  ]);
  assert.equal(sourceTiles(() => false, MAC).find((t) => t.id === "brave")?.name, "Brave or Edge");
  assert.ok(sourceTiles((c) => c.id === "helium", MAC).some((t) => t.id === "helium" && t.found));
});

test("on Windows a tile is found by the import's list, has no app path, and the Mac-only browsers are left out", () => {
  const listed = new Set(["edge", "firefox"]);
  assert.deepEqual(summary(sourceTiles((c) => listed.has(c.importId ?? c.id), WINDOWS)), [
    ["arc", "Arc", false, null, null],
    ["chrome", "Chrome", false, null, null],
    ["firefox", "Firefox", true, null, null],
    ["zen", "Zen", false, null, null],
    ["edge", "Edge", true, null, null],
  ]);
});

test("on Linux the import's list also finds Chromium, Vivaldi and Opera, which the Mac never offers", async () => {
  const { PLATFORM_FEATURES: LINUX } = await import("../../lib/platformFeatures.linux.ts");
  const listed = new Set(["chromium", "vivaldi", "firefox"]);
  assert.deepEqual(summary(sourceTiles((c) => listed.has(c.importId ?? c.id), LINUX)), [
    ["arc", "Arc", false, null, null],
    ["chrome", "Chrome", false, null, null],
    ["firefox", "Firefox", true, null, null],
    ["zen", "Zen", false, null, null],
    ["brave", "Brave or Edge", false, null, null],
    ["chromium", "Chromium", true, null, null],
    ["vivaldi", "Vivaldi", true, null, null],
  ]);
  assert.deepEqual(summary(sourceTiles((c) => c.id === "opera" || c.id === "helium", LINUX)).filter(([, , found]) => found).map(([id]) => id), ["helium", "opera"]);
  assert.ok(!sourceTiles(() => true, MAC).some((t) => ["chromium", "vivaldi", "opera"].includes(t.id)));
});

test("on Linux a Snap or Flatpak Firefox and a Flatpak Zen find their tile and open their own import source", async () => {
  const { PLATFORM_FEATURES: LINUX } = await import("../../lib/platformFeatures.linux.ts");
  const listed = new Set(["firefoxSnap", "zenFlatpak"]);
  const found = summary(sourceTiles((c) => listed.has(c.importId ?? c.id), LINUX)).filter(([, , isFound]) => isFound);
  assert.deepEqual(found, [["firefox", "Firefox", true, null, "firefoxSnap"], ["zen", "Zen", true, null, "zenFlatpak"]]);
  assert.deepEqual(summary(sourceTiles((c) => c.id === "zen" && !c.importId, LINUX)).find(([id]) => id === "zen"), ["zen", "Zen", true, null, null]);
  assert.deepEqual(summary(sourceTiles(() => false, LINUX)).filter(([id]) => id === "firefox" || id === "zen").map(([, name]) => name), ["Firefox", "Zen"]);
  assert.ok(sourceTiles((c) => c.app === "", MAC).every((t) => !t.found));
});

test("an onboarding import from Chromium, Vivaldi or Opera is counted apart from the others", async () => {
  globalThis.__DEV__ = false;
  const stub = await import("../../test-native/index.ts");
  globalThis.fetch = async () => ({ status: 200 });
  const client = await import("../../state/telemetry/client.ts");
  const usage = await import("../../state/telemetry/usage.ts");
  after(() => client.setSharing(false, "settings"));
  client.setSharing(true, "onboarding");
  for (const source of ["vivaldi", "chrome", "opera", "helium"]) usage.noteOnboardingImport(source);
  usage.sessionEnding();
  await client.saveQueueNow();
  const sent = JSON.parse(stub.docs.get("telemetry-queue.json")).events.filter((e) => e.event === "usage_counts").at(-1).properties;
  assert.deepEqual([sent.onboarding_imports, sent.onboarding_helium_imports, sent.onboarding_listed_only_imports], [4, 1, 2]);
});
