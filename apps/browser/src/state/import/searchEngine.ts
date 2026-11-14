import { BUILT_IN_ENGINES, engineById, hostOf, validateEngine, type EngineInput, type SearchEngine } from "@ardia/core";
import { create } from "zustand";
import type { BrowserProfile, ImportedSearchEngine } from "../../platform/importModule";
import { useBrowser } from "../browser/store";
import { searchEngines, type Settings } from "../settings/settings";
import { noteSearchEngineImport, type SearchEngineImportOutcome } from "../telemetry/searchEngineImports";

export type ImportedEngineMatch = { id: string } | { custom: EngineInput } | null;

export type AdoptedEngine = { outcome: SearchEngineImportOutcome; name: string | null; changed: boolean };

export const useImportedSettings = create<{ keys: readonly (keyof Settings)[] }>()(() => ({ keys: [] }));

const noteImportedSettings = (keys: readonly (keyof Settings)[]) =>
  useImportedSettings.setState((s) => ({ keys: [...new Set([...s.keys, ...keys])] }));

export function withoutImportedSettings(patch: Partial<Settings>): Partial<Settings> {
  const { keys } = useImportedSettings.getState();
  if (!keys.some((k) => k in patch)) return patch;
  return Object.fromEntries(Object.entries(patch).filter(([k]) => !keys.includes(k as keyof Settings))) as Partial<Settings>;
}

export function chromiumTemplateUrl(template: string): string {
  return template
    .trim()
    .replace(/^\{google:baseURL\}/, "https://www.google.com/")
    .replace(/\{searchTerms\}/g, "%s")
    .replace(/\{(?:inputEncoding|outputEncoding)\}/g, "UTF-8")
    .replace(/\{[^{}]*\}/g, "")
    .replace(/&{2,}/g, "&")
    .replace(/\?&/, "?")
    .replace(/[?&]+$/, "");
}

const sameUrl = (a: string, b: string) => a.replace(/^(https?:\/\/)www\./i, "$1").toLowerCase() === b.replace(/^(https?:\/\/)www\./i, "$1").toLowerCase();

const onHost = (host: string, engine: SearchEngine) => {
  const own = hostOf(engine.url.replace(/%s/g, "q"));
  return !!own && (host === own || host.endsWith(`.${own}`));
};

function customInput(engine: ImportedSearchEngine, url: string, engines: readonly SearchEngine[]): EngineInput | null {
  const host = hostOf(url.replace(/%s/g, "q"));
  const name = engine.name.trim() || host;
  for (const keyword of [...new Set([engine.keyword.trim().toLowerCase(), host].filter(Boolean))]) {
    const input = { name, keyword, url };
    if (!validateEngine(input, engines)) return input;
  }
  return null;
}

export function matchImportedEngine(engine: ImportedSearchEngine, engines: readonly SearchEngine[]): ImportedEngineMatch {
  const url = chromiumTemplateUrl(engine.url);
  const keyword = engine.keyword.trim().toLowerCase();
  const host = hostOf(url.replace(/%s/g, "q"));
  const same = engines.find((e) => !e.extension && sameUrl(e.url, url));
  if (same) return { id: same.id };
  const named = BUILT_IN_ENGINES.find((e) => e.keyword === keyword);
  if (named) return { id: named.id };
  const prepopulated = engine.prepopulateId ? BUILT_IN_ENGINES.find((e) => onHost(host, e)) : undefined;
  if (prepopulated) return { id: prepopulated.id };
  const custom = customInput(engine, url, engines);
  return custom ? { custom } : null;
}

export function sourceEngine(profiles: readonly { profile: BrowserProfile; engine?: ImportedSearchEngine }[]): ImportedSearchEngine | undefined {
  return (profiles.find((p) => p.profile.isDefault) ?? profiles[0])?.engine;
}

function adopt(engine: ImportedSearchEngine | undefined): AdoptedEngine {
  if (!engine) return { outcome: "source_default", name: null, changed: false };
  const s = useBrowser.getState();
  const match = matchImportedEngine(engine, searchEngines(s.settings));
  if (!match) return { outcome: "unusable", name: null, changed: false };
  let id: string;
  if ("id" in match) id = match.id;
  else {
    const made = s.addCustomEngine(match.custom);
    if ("error" in made) return { outcome: "unusable", name: null, changed: false };
    id = made.id;
  }
  const changed = useBrowser.getState().settings.searchEngine !== id;
  useBrowser.getState().setSearchEngine(id);
  noteImportedSettings(["searchEngine"]);
  const builtIn = BUILT_IN_ENGINES.some((e) => e.id === id);
  return { outcome: builtIn ? "built_in" : "custom", name: engineById(searchEngines(useBrowser.getState().settings), id).name, changed };
}

export function adoptImportedEngine(sourceId: string, engine: ImportedSearchEngine | undefined): AdoptedEngine {
  const adopted = adopt(engine);
  noteSearchEngineImport(sourceId, adopted.outcome, adopted.changed);
  return adopted;
}
