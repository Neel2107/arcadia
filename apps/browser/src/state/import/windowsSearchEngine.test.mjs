import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { importProfile, Unlocks } from "../../../../../packages/expo-windows/src/import/importer.ts";
import { chromiumEngine, readSearchEngine } from "../../../../../packages/expo-windows/src/import/searchEngine.ts";
import { fakeHost, LOCAL, support } from "./fixtures/windowsHost.mjs";

const quiet = { progress() {}, cancelled: () => false };
const engine = async (browserId, profileId, kinds = ["bookmarks"]) => (await importProfile(fakeHost(), new Unlocks(), browserId, profileId, kinds, {}, quiet)).searchEngine;

test("Windows: an Arc profile on DuckDuckGo brings its Web Data keyword row", async () => {
  assert.deepEqual(await engine("arc", "Default"), { name: "DuckDuckGo", keyword: "duckduckgo.com", url: "https://duckduckgo.com/?q={searchTerms}", prepopulateId: 92 });
});

test("Windows: a profile on the browser's own default brings nothing, and the key stays out of the result", async () => {
  const brave = await importProfile(fakeHost(), new Unlocks(), "brave", "Default", ["bookmarks"], {}, quiet);
  assert.equal("searchEngine" in brave, false);
  assert.equal(await engine("arc", "Profile 1"), undefined);
});

test("Windows: a custom engine keeps its template, and Preferences alone is enough without Web Data's row", async () => {
  assert.deepEqual(await engine("chrome", "Default"), { name: "Ardia Docs", keyword: "docs", url: "https://docs.ardia.example/find?q={searchTerms}&enc={inputEncoding}&{google:RLZ}" });
  const bing = await engine("chrome", "Profile 1");
  assert.equal(bing.keyword, "bing.com");
  assert.equal(bing.prepopulateId, 3);
  assert.ok(bing.url.startsWith("https://www.bing.com/search?q={searchTerms}"));
});

test("Windows: the engine is read whatever kinds are asked for, and Web Data is left as it was", async () => {
  const webData = join(support, "Arc/User Data/Default/Web Data");
  const before = readFileSync(webData);
  assert.equal((await engine("arc", "Default", []))?.keyword, "duckduckgo.com");
  assert.deepEqual(readFileSync(webData), before);
});

test("Windows: Chromium's optional search-terms placeholder counts, a template without one doesn't", () => {
  assert.equal(chromiumEngine("Find", "find", "https://search.example/?q={searchTerms?}", null)?.url, "https://search.example/?q={searchTerms}");
  assert.equal(chromiumEngine("Find", "find", "https://search.example/?q={searchTerm}", null), undefined);
  assert.equal(chromiumEngine("", "", " https://x.example/?q={searchTerms} ", "7")?.prepopulateId, 7);
  assert.equal("prepopulateId" in chromiumEngine("X", "x", "https://x.example/?q={searchTerms}", 0), false);
});

test("Windows: missing, broken or unusable Preferences bring nothing", async () => {
  const profile = `${LOCAL}\\Scratch\\User Data\\Default`;
  let prefs = null;
  const host = { ...fakeHost(), readText: async (path) => (path === `${profile}\\Preferences` ? prefs : null), list: async () => [] };
  assert.equal(await readSearchEngine(host, profile), undefined);
  prefs = "{not json";
  assert.equal(await readSearchEngine(host, profile), undefined);
  prefs = JSON.stringify({ default_search_provider_data: { template_url_data: { short_name: "Odd", keyword: "odd", url: "https://odd.example/" } } });
  assert.equal(await readSearchEngine(host, profile), undefined);
  prefs = JSON.stringify({ default_search_provider: { guid: "missing" }, default_search_provider_data: { template_url_data: { short_name: "Kagi", keyword: "k", url: "https://kagi.com/search?q={searchTerms}" } } });
  assert.deepEqual(await readSearchEngine(host, profile), { name: "Kagi", keyword: "k", url: "https://kagi.com/search?q={searchTerms}" }, "a chosen engine with no Web Data falls back to Preferences");
});
