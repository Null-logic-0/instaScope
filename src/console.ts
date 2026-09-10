import { createAiConsole } from "./ai/console";
import type { OllamaClientOptions } from "./ai/ollama";
import { buildDataset, computeStats, datasetFilename, type Dataset, type Stats } from "./analytics";
import type { CollectionResult, Progress } from "./collector";
import { collectFollowers, collectFollowing, type FeatureOptions } from "./features/follow-list";
import { collectLikes } from "./features/likes";
import { parseProfileHref } from "./instagram/profile-link";
import { copyToClipboard, download, downloadCsvText } from "./output/browser";
import { datasetToCsv, toCsv, toJson } from "./output/format";
import { Store, type StorageBackend } from "./store/store";
import type { ListKind, User } from "./types";

export interface ConsoleOptions {
  log?: (message: string) => void;
  progressIntervalMs?: number;
  storage?: StorageBackend;
  ai?: OllamaClientOptions;
}

type Feature = (options: FeatureOptions) => Promise<CollectionResult>;

export function createConsoleApi({
  log = console.log,
  progressIntervalMs = 2000,
  storage = localStorage,
  ai: aiOptions,
}: ConsoleOptions = {}) {
  const store = new Store(storage);
  let current: AbortController | null = null;

  async function run(kind: ListKind, feature: Feature, options: FeatureOptions): Promise<CollectionResult> {
    if (current) throw new Error("A collection is already running. Call instaScope.cancel() first.");
    current = new AbortController();
    const started = Date.now();
    let lastReport = started;

    const onProgress = (progress: Progress): void => {
      options.onProgress?.(progress);
      if (Date.now() - lastReport < progressIntervalMs) return;
      lastReport = Date.now();
      log(`[instaScope] ${kind}: ${progress.collected} users so far (${elapsed(started)})`);
    };

    const onVisibilityChange = (): void => {
      log(
        document.visibilityState === "hidden"
          ? `[instaScope] ${kind}: paused, the tab is hidden. Bring it to the front to continue.`
          : `[instaScope] ${kind}: resumed.`,
      );
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (document.visibilityState === "hidden") onVisibilityChange();

    try {
      const result = await feature({ ...options, signal: current.signal, onProgress });
      log(`[instaScope] ${kind}: ${result.users.length} users, ${describe(result)} (${elapsed(started)})`);
      saveSnapshot(kind, result);
      return result;
    } finally {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      current = null;
    }
  }

  function saveSnapshot(kind: ListKind, result: CollectionResult): void {
    if (result.stopReason !== "end_of_list") {
      log(`[instaScope] ${kind}: partial result, not saved as a snapshot.`);
      return;
    }
    const subject = subjectFor(kind, document.location.pathname);
    store.recordSnapshot({ subject, kind, users: result.users });
    log(`[instaScope] ${kind}: snapshot of ${subject} saved (${store.snapshots(subject, kind).length} in history).`);
  }

  function subjectOrLatest(subject?: string): string {
    const resolved = subject ?? store.data.subject;
    if (!resolved) {
      throw new Error("Nothing collected yet. Run collectFollowers() or collectFollowing() first, or importJson().");
    }
    return resolved;
  }

  const exportCsv = (dataset: Dataset = "snapshot", subject?: string): string =>
    datasetToCsv(buildDataset(store, subjectOrLatest(subject), dataset));

  return {
    store,
    ai: createAiConsole({ store, subjectOrLatest, log, ...(aiOptions && { client: aiOptions }) }),
    collectFollowers: (options: FeatureOptions = {}) => run("followers", collectFollowers, options),
    collectFollowing: (options: FeatureOptions = {}) => run("following", collectFollowing, options),
    collectLikes: (options: FeatureOptions = {}) => run("likes", collectLikes, options),
    cancel: (): boolean => {
      if (!current) return false;
      current.abort();
      return true;
    },
    subjects: () => store.subjects(),
    stats: (subject?: string): Stats => {
      const stats = computeStats(store, subjectOrLatest(subject));
      log(formatStats(stats));
      return stats;
    },
    dataset: (name: Dataset, subject?: string) => buildDataset(store, subjectOrLatest(subject), name),
    exportCsv,
    downloadCsv: (target: Dataset | User[] = "snapshot", subject?: string): void => {
      if (typeof target === "string") downloadCsvText(exportCsv(target, subject), datasetFilename(target));
      else downloadCsvText(toCsv(target), "instascope.csv");
    },
    downloadJson: (users?: User[]): void => {
      if (users) download("instascope.json", toJson(users), "application/json");
      else download(`instascope-backup-${today()}.json`, store.exportJson(), "application/json");
    },
    importJson: async (input: File | string): Promise<{ profiles: number; snapshots: number }> => {
      const imported = store.importJson(typeof input === "string" ? input : await input.text());
      log(`[instaScope] imported ${imported.profiles} new profiles and ${imported.snapshots} new snapshots.`);
      return imported;
    },
    toCsv,
    toJson,
    copyToClipboard,
  };
}

export function subjectFor(kind: ListKind, pathname: string): string {
  if (kind === "likes") {
    const post = /^\/(p|reel)\/([^/]+)\//.exec(pathname);
    return post ? `${post[1]}/${post[2]}` : "unknown";
  }
  const [, first = ""] = pathname.split("/");
  return parseProfileHref(`/${first}/`) ?? "unknown";
}

function formatStats(stats: Stats): string {
  const n = (value: number | null) => (value === null ? "n/a" : String(value));
  const date = (value: string | null) => (value ? value.slice(0, 10) : "n/a");
  return (
    `[instaScope] ${stats.subject}: followers ${n(stats.followers)} (${date(stats.followersTakenAt)}), ` +
    `following ${n(stats.following)} (${date(stats.followingTakenAt)}), mutuals ${n(stats.mutuals)}, ` +
    `not following back ${n(stats.notFollowingBack)}, fans ${n(stats.fans)}, ` +
    `new followers ${n(stats.newFollowers)}, lost followers ${n(stats.lostFollowers)} ` +
    `(since ${date(stats.previousFollowersTakenAt)})`
  );
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
