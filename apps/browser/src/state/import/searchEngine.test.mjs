import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, test } from "node:test";

globalThis.require = createRequire(import.meta.url);
globalThis.__DEV__ = false;
globalThis.fetch = async () => ({ status: 200 });

const GOOGLE = {
  name: "Google",
  keyword: "google.com",
  url: "{google:baseURL}search?q={searchTerms}&{google:RLZ}{google:originalQueryForSuggestion}{google:assistedQueryStats}ie={inputEncoding}",
  prepopulateId: 1,
};
const DUCKDUCKGO = { name: "DuckDuckGo", keyword: "duckduckgo.com", url: "https://duckduckgo.com/?q={searchTerms}", prepopulateId: 92 };
const BING = { name: "Bing", keyword: "bing.com", url: "https://www.bing.com/search?q={searchTerms}&PC=U316&FORM=CHROMN", prepopulateId: 3 };
const DOCS = { name: "Ardia Docs", keyword: "docs", url: "https://docs.ardia.example/find?q={searchTerms}&enc={inputEncoding}&{google:RLZ}" };

let engines = {};
globalThis.acTestNativeModules = {
  ArdiaImport: {
    addListener: () => ({ remove() {} }),
    isBrowserUnlocked: () => true,
    forgetUnlockedKeys() {},
    cancelImport() {},
    listExtensions: async () => "[]",
    importData: async (_job, browserId, profileId) =>
      JSON.stringify({
        browserId, profileId, history: [], historyCount: 0, tabs: [], tabGroups: [], credentials: [], cookieCount: 0, addressCount: 0, cardCount: 0,
        spaces: [], favorites: [], favicons: [], failed: [], warnings: [],
        ...(engines[profileId] ? { searchEngine: engines[profileId] } : {}),
      }),
  },
};

const stub = await import("../../test-native/index.ts");
Object.assign(stub.appInfo, { appVersion: "0.3.0", appBuild: "300", osVersion: "27.0.1", arch: "arm64", isolatedInstance: false });
stub.docs.set("telemetry.json", JSON.stringify({ version: 1, sharing: true, decidedAt: 1, askDoneAt: 1, installId: "install-1", crashCursor: 0, lastVersion: "0.3.0", sessionOpen: false }));
const client = await import("../telemetry/client.ts");
const local = await import("../telemetry/localStore.ts");
const { BUILT_IN_ENGINES } = await import("@ardia/core");
const { useBrowser } = await import("../browser/store.ts");
const { searchEngines } = await import("../settings/settings.ts");
const { useImportFlow } = await import("./flow.ts");
const { runImport } = await import("./runImport.ts");
const { chromiumTemplateUrl, matchImportedEngine, sourceEngine, useImportedSettings } = await import("./searchEngine.ts");
const { chooseSource, confirmAnswer, sourcePatch, startOnboarding, useOnboarding } = await import("../onboarding/onboarding.ts");
client.startClient();
after(() => client.flush());

const S = () => useBrowser.getState();
const sent = () => (local.flushLocal(), stub.telemetryLocal.records().filter((r) => r.event === "search_engine_import"));
const fresh = () => {
  S().hydrate({});
  useImportedSettings.setState({ keys: [] });
};

test("Chromium's URL templates become Ardia's %s URLs", () => {
  assert.equal(chromiumTemplateUrl(GOOGLE.url), "https://www.google.com/search?q=%s&ie=UTF-8");
  assert.equal(chromiumTemplateUrl(DUCKDUCKGO.url), "https://duckduckgo.com/?q=%s");
  assert.equal(chromiumTemplateUrl(DOCS.url), "https://docs.ardia.example/find?q=%s&enc=UTF-8");
  assert.equal(chromiumTemplateUrl("https://x.example/s?{google:RLZ}q={searchTerms}"), "https://x.example/s?q=%s");
});

test("a Chromium engine maps onto the built-in engine it is, whatever its extra parameters", () => {
  const list = BUILT_IN_ENGINES;
  const idOf = (e) => matchImportedEngine(e, list)?.id;
  assert.equal(idOf(GOOGLE), "google");
  assert.equal(idOf(DUCKDUCKGO), "duckduckgo");
  assert.equal(idOf(BING), "bing");
  assert.equal(idOf({ name: "Ecosia", keyword: "ecosia.org", url: "https://www.ecosia.org/search?q={searchTerms}&addon=chrome", prepopulateId: 101 }), "ecosia");
  assert.equal(idOf({ name: "Brave", keyword: "search.brave.com", url: "https://search.brave.com/search?q={searchTerms}&source=desktop", prepopulateId: 109 }), "brave");
  assert.equal(idOf({ name: "Yahoo! UK", keyword: "uk.yahoo.com", url: "https://uk.search.yahoo.com/search?ei={inputEncoding}&fr=crmas&p={searchTerms}", prepopulateId: 2 }), "yahoo");
  assert.equal(idOf({ name: "Kagi", keyword: "k", url: "https://kagi.com/search?q={searchTerms}" }), "kagi", "a hand-made engine with a built-in's address is that built-in");
  assert.equal(idOf({ name: "Startpage", keyword: "sp", url: "https://www.startpage.com/do/search?q={searchTerms}" }), "startpage");
});

test("an engine Ardia doesn't have comes over as a custom engine, with a free shortcut", () => {
  assert.deepEqual(matchImportedEngine(DOCS, BUILT_IN_ENGINES), { custom: { name: "Ardia Docs", keyword: "docs", url: "https://docs.ardia.example/find?q=%s&enc=UTF-8" } });
  const taken = [...BUILT_IN_ENGINES, { id: "mine", name: "Mine", keyword: "docs", url: "https://mine.example/?q=%s", custom: true }];
  assert.deepEqual(matchImportedEngine(DOCS, taken), { custom: { name: "Ardia Docs", keyword: "docs.ardia.example", url: "https://docs.ardia.example/find?q=%s&enc=UTF-8" } });
  const again = [...BUILT_IN_ENGINES, { id: "docs-1", name: "Ardia Docs", keyword: "docs", url: "https://docs.ardia.example/find?q=%s&enc=UTF-8", custom: true }];
  assert.deepEqual(matchImportedEngine(DOCS, again), { id: "docs-1" }, "importing it again reuses the one already there");
  assert.equal(matchImportedEngine({ name: "Odd", keyword: "odd", url: "ftp://odd.example/{searchTerms}" }, BUILT_IN_ENGINES), null);
  assert.deepEqual(matchImportedEngine({ name: "Yandex", keyword: "yandex.ru", url: "https://yandex.ru/search/?text={searchTerms}", prepopulateId: 15 }, BUILT_IN_ENGINES), {
    custom: { name: "Yandex", keyword: "yandex.ru", url: "https://yandex.ru/search/?text=%s" },
  });
});

test("the main profile's engine is the one that counts, even when it's the browser's own default", () => {
  const p = (id, isDefault) => ({ id, name: id, path: id, isDefault, available: [] });
  assert.equal(sourceEngine([{ profile: p("Profile 1", false), engine: BING }, { profile: p("Default", true), engine: DUCKDUCKGO }]), DUCKDUCKGO);
  assert.equal(sourceEngine([{ profile: p("Profile 1", false), engine: BING }, { profile: p("Default", true) }]), undefined);
  assert.equal(sourceEngine([{ profile: p("Profile 3", false), engine: BING }]), BING);
  assert.equal(sourceEngine([]), undefined);
});

const arc = (ids) => ({
  id: "arc", name: "Arc", family: "chromium", requiresExport: false, needsKeychain: false,
  profiles: ids.map((id) => ({ id, name: id, path: id, isDefault: id === "Default", available: ["bookmarks"] })),
});

async function importFrom(source) {
  S().createWindow({ url: "https://start.example/" });
  const ids = source.profiles.map((p) => p.id);
  useImportFlow.setState({ source, sourceProfiles: ids, spaces: [], target: "default", kinds: new Set(["bookmarks"]), step: { name: "choose", error: null } });
  await runImport(new Set(["bookmarks"]));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(useImportFlow.getState().step.name, "done");
  return useImportFlow.getState().step;
}

test("importing from Arc on DuckDuckGo makes it Ardia's engine, says so, and sends only the outcome", async () => {
  fresh();
  engines = { Default: DUCKDUCKGO, "Profile 1": BING };
  const before = sent().length;
  const step = await importFrom(arc(["Profile 1", "Default"]));
  assert.equal(S().settings.searchEngine, "duckduckgo");
  assert.equal(step.searchEngine, "DuckDuckGo");
  const events = sent().slice(before);
  assert.equal(events.length, 1);
  assert.deepEqual(
    Object.fromEntries(["source", "outcome", "changed"].map((k) => [k, events[0].properties[k]])),
    { source: "arc", outcome: "built_in", changed: true },
  );
  assert.ok(!JSON.stringify(events[0]).toLowerCase().includes("duckduckgo"), "never which engine");
  const again = await importFrom(arc(["Default"]));
  assert.equal(again.searchEngine, undefined, "nothing to say when the engine was already this one");
  assert.equal(sent().at(-1).properties.changed, false);
});

test("a custom engine comes over once and becomes the default", async () => {
  fresh();
  engines = { Default: DOCS };
  await importFrom(arc(["Default"]));
  await importFrom(arc(["Default"]));
  const custom = S().settings.customSearchEngines;
  assert.equal(custom.length, 1);
  assert.deepEqual({ name: custom[0].name, keyword: custom[0].keyword, url: custom[0].url }, { name: "Ardia Docs", keyword: "docs", url: "https://docs.ardia.example/find?q=%s&enc=UTF-8" });
  assert.equal(S().settings.searchEngine, custom[0].id);
  assert.ok(searchEngines(S().settings).some((e) => e.id === custom[0].id));
  assert.equal(sent().at(-1).properties.outcome, "custom");
});

test("a source on its own default leaves Ardia's engine alone", async () => {
  fresh();
  S().setSearchEngine("kagi");
  engines = {};
  const step = await importFrom(arc(["Default"]));
  assert.equal(S().settings.searchEngine, "kagi");
  assert.equal(step.searchEngine, undefined);
  assert.equal(sent().at(-1).properties.outcome, "source_default");
});

test("in onboarding, the engine an import brought over wins over the browser's preset, whichever comes first", async () => {
  fresh();
  const id = S().createWindow();
  startOnboarding(id, "source");
  chooseSource("arc");
  assert.equal(sourcePatch().searchEngine, "google", "before an import the preset sets Google");
  engines = { Default: DUCKDUCKGO };
  await importFrom(arc(["Default"]));
  const patch = sourcePatch();
  assert.equal("searchEngine" in patch, false);
  assert.equal(patch.tabLayout, "sidebar", "the rest of the preset still applies");
  confirmAnswer("source", patch, []);
  assert.equal(S().settings.searchEngine, "duckduckgo");

  fresh();
  startOnboarding(S().createWindow(), "source");
  chooseSource("arc");
  confirmAnswer("source", sourcePatch(), []);
  assert.equal(S().settings.searchEngine, "google");
  await importFrom(arc(["Default"]));
  assert.equal(S().settings.searchEngine, "duckduckgo", "an import after Continue still brings it");
  useOnboarding.setState({ windowId: null, leaving: false, redo: false });
});
