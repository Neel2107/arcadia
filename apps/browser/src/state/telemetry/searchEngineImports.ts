import { capture } from "./client";

export type SearchEngineImportOutcome = "built_in" | "custom" | "source_default" | "unusable";

export const noteSearchEngineImport = (source: string, outcome: SearchEngineImportOutcome, changed: boolean) =>
  capture("search_engine_import", { source, outcome, changed });
