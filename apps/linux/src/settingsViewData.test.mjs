import assert from "node:assert/strict";
import test from "node:test";

test("Settings › Privacy shows View My Data once the shell has storage for the local copy", async () => {
  globalThis.indexedDB = { open() { throw new Error("unused"); } };
  globalThis.document = {};
  const index = await import("./settingsIndex.ts");
  assert.equal(index.settingUnavailable("privacy.viewData"), false);
  assert.equal(index.sectionUnavailable("privacy", "Kept on this Mac"), false);
  assert.ok(index.SETTINGS_INDEX.some((item) => item.entry.id === "privacy.viewData"));
  assert.equal(index.settingUnavailable("privacy.shareDiagnostics"), true);
});
