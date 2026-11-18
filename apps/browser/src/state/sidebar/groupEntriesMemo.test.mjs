import assert from "node:assert/strict";
import { test } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
const { groupEntries } = await import("./entries.ts");
const { entryKey } = await import("./entryKey.ts");

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc");

const tab = (id) => ({ id, windowId: "w", profileId: "default", url: `https://example.com/${id}`, pin: undefined, page: { kind: "idle" } });
const tabs = Object.fromEntries(["t1", "t2", "t3", "t4", "t5", "t6"].map((id) => [id, tab(id)]));
const group = (id, tabIds, parentId) => ({ id, windowId: "w", profileId: "default", name: id, tabIds, ...(parentId ? { parentId } : {}) });
const state = (groups) => ({ tabs, splits: {}, groups });

async function settle() {
  for (let i = 0; i < 4; i++) {
    gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test("looking up only the changed group keeps no older groups records alive", async () => {
  const alive = new Set();
  const registry = new FinalizationRegistry((n) => alive.delete(n));
  let groups = { a: group("a", ["t1", "t2"]), b: group("b", ["t3", "t4"]) };
  for (let n = 0; n < 2000; n++) {
    const id = n % 2 ? "a" : "b";
    groups = { ...groups, [id]: { ...groups[id], name: `${id}${n}` } };
    alive.add(n);
    registry.register(groups, n);
    groupEntries(state(groups), id);
  }
  await settle();
  assert.ok(alive.size <= 2, `${alive.size} of 2000 groups records are still alive`);
});

test("a group's entries follow its child groups and keep their identity across unrelated changes", () => {
  const parent = group("p", ["t1", "t2", "t3", "t4"]);
  let groups = { p: parent, c: group("c", ["t2", "t3"], "p"), other: group("other", ["t5"]) };
  const first = groupEntries(state(groups), "p");
  assert.deepEqual(first, [entryKey("tab", "t1"), entryKey("group", "c"), entryKey("tab", "t4")]);
  groups = { ...groups, other: group("other", ["t5", "t6"]) };
  assert.equal(groupEntries(state(groups), "p"), first);
  groups = { ...groups, c: { ...groups.c, name: "renamed" } };
  assert.equal(groupEntries(state(groups), "p"), first);
  groups = { ...groups, c: group("c", ["t2"], "p") };
  const moved = groupEntries(state(groups), "p");
  assert.deepEqual(moved, [entryKey("tab", "t1"), entryKey("group", "c"), entryKey("tab", "t3"), entryKey("tab", "t4")]);
  groups = { ...groups, d: group("d", ["t3"], "p") };
  assert.deepEqual(groupEntries(state(groups), "p"), [entryKey("tab", "t1"), entryKey("group", "c"), entryKey("group", "d"), entryKey("tab", "t4")]);
});
