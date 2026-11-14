import assert from "node:assert/strict";
import { after, test } from "node:test";

globalThis.__DEV__ = false;
const stub = await import("../../test-native/index.ts");
globalThis.fetch = async () => ({ status: 200 });

const client = await import("../../state/telemetry/client.ts");
const usage = await import("../../state/telemetry/usage.ts");
const { noPagePeekReason } = await import("./useNoPagePeek.ts");
after(() => client.setSharing(false, "settings"));

async function noPagePeeks() {
  usage.sessionEnding();
  await client.saveQueueNow();
  const queue = stub.docs.get("telemetry-queue.json");
  const events = queue ? JSON.parse(queue).events.filter((e) => e.event === "usage_counts") : [];
  return events.reduce((n, e) => n + (e.properties.sidebar_no_page_peeks ?? 0), 0);
}

test("a no-page peek is counted when it slides out for that reason, not when the sidebar was already out from a hover", async () => {
  client.setSharing(true, "onboarding");
  const before = await noPagePeeks();
  const reason = noPagePeekReason();

  reason.byHand();
  reason.opened();
  reason.ask(true);
  assert.equal(await noPagePeeks(), before);

  reason.byHand();
  reason.opened();
  assert.equal(await noPagePeeks(), before);

  reason.ask(true);
  reason.opened();
  assert.equal(await noPagePeeks(), before + 1);

  reason.ask(false);
  reason.opened();
  assert.equal(await noPagePeeks(), before + 1);
});
