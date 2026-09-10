import { createConsoleApi } from "./console";

export type { Dataset, DatasetRow, Relationship, Stats } from "./analytics";
export type { CollectionResult, Progress, StopReason } from "./collector";
export type { FeatureOptions } from "./features/follow-list";
export type { Classification, ListKind, ProfileRecord, Snapshot, StoreData, User } from "./types";

export const {
  store,
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
} = createConsoleApi();
