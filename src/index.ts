import { createConsoleApi } from "./console";

export type { CollectionResult, Progress, StopReason } from "./collector";
export type { FeatureOptions } from "./features/follow-list";
export type { User } from "./types";

export const {
  collectFollowers,
  collectFollowing,
  collectLikes,
  cancel,
  toCsv,
  toJson,
  downloadCsv,
  downloadJson,
  copyToClipboard,
} = createConsoleApi();
