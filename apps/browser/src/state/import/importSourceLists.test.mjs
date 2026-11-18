import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
globalThis.require = createRequire(import.meta.url);
globalThis.__DEV__ = false;

const source = (id, family) => ({ id, name: id, family, requiresExport: false, needsKeychain: false,
  profiles: [{ id: "p", name: "p", path: "/p", isDefault: true, available: ["bookmarks"] }] });

let listed = [];
globalThis.acTestNativeModules = {
  ArdiaImport: {
    addListener: () => ({ remove() {} }),
    forgetUnlockedKeys() {},
    isBrowserUnlocked: () => true,
    safariHasFullDiskAccess: () => false,
    listBrowsers: async () => JSON.stringify(listed),
  },
};

await import("../../test-native/index.ts");
const { startImport, importNow } = await import("./flow.ts");
const { takeImportRuns } = await import("../telemetry/importRuns.ts");

async function openImportWindow(sources) {
  listed = sources;
  const stop = startImport(0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  stop();
  return importNow().browsers.map((b) => b.id);
}

test("each import window counts whether it found a Firefox or Zen to import from, and the counts reset", async () => {
  takeImportRuns();
  assert.deepEqual(await openImportWindow([source("helium", "chromium"), source("chromium", "chromium")]), ["helium", "chromium"]);
  assert.deepEqual(await openImportWindow([source("chromium", "chromium"), source("firefox", "firefox"), source("zen", "firefox")]), ["chromium", "firefox", "zen"]);
  const taken = takeImportRuns();
  assert.deepEqual([taken.import_source_lists, taken.import_source_lists_with_firefox], [2, 1]);
  assert.deepEqual([takeImportRuns().import_source_lists, takeImportRuns().import_source_lists_with_firefox], [0, 0]);
});
