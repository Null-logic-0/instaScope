import type { CollectionResult, Progress } from "./collector";
import { collectFollowers, collectFollowing, type FeatureOptions } from "./features/follow-list";
import { collectLikes } from "./features/likes";
import { copyToClipboard, downloadCsv, downloadJson } from "./output/browser";
import { toCsv, toJson } from "./output/format";

export interface ConsoleOptions {
  log?: (message: string) => void;
  progressIntervalMs?: number;
}

type Feature = (options: FeatureOptions) => Promise<CollectionResult>;

export function createConsoleApi({ log = console.log, progressIntervalMs = 2000 }: ConsoleOptions = {}) {
  let current: AbortController | null = null;

  async function run(name: string, feature: Feature, options: FeatureOptions): Promise<CollectionResult> {
    if (current) throw new Error("A collection is already running. Call instaScope.cancel() first.");
    current = new AbortController();
    const started = Date.now();
    let lastReport = started;

    const onProgress = (progress: Progress): void => {
      options.onProgress?.(progress);
      if (Date.now() - lastReport < progressIntervalMs) return;
      lastReport = Date.now();
      log(`[instaScope] ${name}: ${progress.collected} users so far (${elapsed(started)})`);
    };

    const onVisibilityChange = (): void => {
      log(
        document.visibilityState === "hidden"
          ? `[instaScope] ${name}: paused, the tab is hidden. Bring it to the front to continue.`
          : `[instaScope] ${name}: resumed.`,
      );
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    try {
      const result = await feature({ ...options, signal: current.signal, onProgress });
      log(`[instaScope] ${name}: ${result.users.length} users, ${describe(result)} (${elapsed(started)})`);
      return result;
    } finally {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      current = null;
    }
  }

  return {
    collectFollowers: (options: FeatureOptions = {}) => run("followers", collectFollowers, options),
    collectFollowing: (options: FeatureOptions = {}) => run("following", collectFollowing, options),
    collectLikes: (options: FeatureOptions = {}) => run("likes", collectLikes, options),
    cancel: (): boolean => {
      if (!current) return false;
      current.abort();
      return true;
    },
    toCsv,
    toJson,
    downloadCsv,
    downloadJson,
    copyToClipboard,
  };
}

function describe(result: CollectionResult): string {
  switch (result.stopReason) {
    case "end_of_list":
      return "reached the end of the list";
    case "target_reached":
      return "reached the requested number";
    case "cancelled":
      return "cancelled, results are partial";
    case "stalled":
      return "stalled, Instagram stopped loading rows; results are partial";
  }
}

function elapsed(since: number): string {
  return `${Math.round((Date.now() - since) / 1000)}s`;
}
