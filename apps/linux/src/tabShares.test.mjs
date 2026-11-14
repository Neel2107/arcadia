import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TAB_SHARE_EVENT, watchTabShares } from "./tabShares.ts";

function nativeHost(capabilities) {
  const listeners = new Set();
  return {
    bootstrap: { windowId: "main", capabilities },
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    emit(module, event, payload) { for (const listener of [...listeners]) listener(module, event, payload); },
    listeners,
  };
}

test("a tab share the engine reports is noted with its capturer, shared tab and site", () => {
  const host = nativeHost([TAB_SHARE_EVENT]);
  const notes = [];
  const stop = watchTabShares(host, (...note) => notes.push(note));
  host.emit("ArdiaMedia", "media", { name: TAB_SHARE_EVENT, data: { capturer: "meet", captured: "slides", origin: "https://meet.example" } });
  host.emit("ArdiaMedia", "media", { name: TAB_SHARE_EVENT, data: { capturer: "meet", captured: "notes" } });
  assert.deepEqual(notes, [["meet", "slides", "https://meet.example"], ["meet", "notes", ""]]);
  stop();
  host.emit("ArdiaMedia", "media", { name: TAB_SHARE_EVENT, data: { capturer: "meet", captured: "slides", origin: "" } });
  assert.equal(notes.length, 2);
});

test("other events, other channels and malformed shares are ignored", () => {
  const host = nativeHost([TAB_SHARE_EVENT]);
  const notes = [];
  watchTabShares(host, (...note) => notes.push(note));
  host.emit("ArdiaMedia", "media", { name: "media.deviceChooser", data: { capturer: "a", captured: "b" } });
  host.emit("ArdiaPermissions", "permissions", { name: TAB_SHARE_EVENT, data: { capturer: "a", captured: "b" } });
  host.emit("ArdiaMedia", "other", { name: TAB_SHARE_EVENT, data: { capturer: "a", captured: "b" } });
  host.emit("ArdiaMedia", "media", { name: TAB_SHARE_EVENT, data: { capturer: 1, captured: "b" } });
  host.emit("ArdiaMedia", "media", { name: TAB_SHARE_EVENT, data: { capturer: "a" } });
  host.emit("ArdiaMedia", "media", { name: TAB_SHARE_EVENT, data: null });
  host.emit("ArdiaMedia", "media", null);
  assert.deepEqual(notes, []);
});

test("an engine that does not report tab shares is not listened to", () => {
  const host = nativeHost(["media.stopCapture"]);
  watchTabShares(host, () => assert.fail("nothing to note"));
  assert.equal(host.listeners.size, 0);
});

test("the event name is the engine's, and a browser window notes shares into the shared share bar", () => {
  const core = readFileSync(new URL("../../../engine/ardiacore-linux/src/ardia/linux/ac_linux_media_share.h", import.meta.url), "utf8");
  assert.ok(core.includes(`kTabShareEvent[] = "${TAB_SHARE_EVENT}"`));
  const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
  assert.ok(main.includes('import { noteTabShare } from "../../browser/src/state/media/screenShare";'));
  assert.ok(main.includes("watchTabShares(ardiaHost, noteTabShare);"));
  assert.ok(main.indexOf("await startUtility(ardiaHost);") < main.indexOf("watchTabShares(ardiaHost, noteTabShare);"));
});
