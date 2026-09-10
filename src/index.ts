import { createConsoleApi } from "./console";

export type { Dataset, DatasetRow, Relationship, Stats } from "./analytics";
export type { CollectionResult, Progress, StopReason } from "./collector";
export type { FeatureOptions } from "./features/follow-list";
export type { Classification, ListKind, ProfileRecord, Snapshot, StoreData, User } from "./types";

export type { ClassifyResult } from "./ai/classify";
export type { OllamaConfig, OllamaStatus } from "./ai/ollama";

function log(message: string): void {
  console.log(message);
  document.dispatchEvent(new CustomEvent("instascope:log", { detail: message }));
}

export const {
  store,
  ai,
  collectFollowers,
  collectFollowing,
  collectLikes,
  cancel,
  subjects,
  stats,
  dataset,
  exportCsv,
  downloadCsv,
  downloadJson,
  importJson,
  toCsv,
  toJson,
  copyToClipboard,
} = createConsoleApi({ log });
