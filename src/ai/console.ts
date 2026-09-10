import { buildDataset, computeStats, type Dataset, type Stats } from "../analytics";
import type { Store } from "../store/store";
import { classifyProfiles, DEFAULT_CATEGORIES, type ClassifyResult } from "./classify";
import { OllamaClient, type OllamaClientOptions, type OllamaConfig, type OllamaStatus } from "./ollama";
import { explainStats } from "./report";

export interface AiConsoleOptions {
  store: Store;
  subjectOrLatest: (subject?: string) => string;
  log: (message: string) => void;
  client?: OllamaClientOptions;
}

export interface ClassifyCommand {
  subject?: string;
  dataset?: Dataset;
  usernames?: string[];
  categories?: readonly string[];
  batchSize?: number;
  force?: boolean;
}

export function createAiConsole({ store, subjectOrLatest, log, client: clientOptions }: AiConsoleOptions) {
  const client = new OllamaClient(clientOptions);
  let current: AbortController | null = null;

  function begin(): AbortController {
    if (current) throw new Error("An AI operation is already running. Call instaScope.ai.cancel() first.");
    current = new AbortController();
    return current;
  }

  return {
    categories: DEFAULT_CATEGORIES,
    config: (): Readonly<OllamaConfig> => client.config,
    configure: (patch: Partial<OllamaConfig>): Readonly<OllamaConfig> => {
      const config = client.configure(patch);
      log(`[instaScope] Ollama configured: ${config.baseUrl}, model ${config.model}`);
      return config;
    },
    status: async (): Promise<OllamaStatus> => {
      const status = await client.status();
      log(formatStatus(status));
      return status;
    },
    classify: async (command: ClassifyCommand = {}): Promise<ClassifyResult> => {
      const controller = begin();
      try {
        const usernames =
          command.usernames ??
          (command.dataset
            ? buildDataset(store, subjectOrLatest(command.subject), command.dataset).map((row) => row.username)
            : undefined);
        const result = await classifyProfiles({
          client,
          store,
          ...(usernames && { usernames }),
          ...(command.categories && { categories: command.categories }),
          ...(command.batchSize !== undefined && { batchSize: command.batchSize }),
          ...(command.force !== undefined && { force: command.force }),
          signal: controller.signal,
          onProgress: ({ done, total }) => log(`[instaScope] Classifying profiles: ${done} / ${total}`),
        });
        log(formatClassifyResult(result));
        return result;
      } finally {
        current = null;
      }
    },
    report: async (subject?: string): Promise<{ stats: Stats; text: string }> => {
      const controller = begin();
      try {
        const stats = computeStats(store, subjectOrLatest(subject));
        const text = await explainStats({ client, stats, signal: controller.signal });
        log(`[instaScope] ${stats.subject}: ${text}`);
        return { stats, text };
      } finally {
        current = null;
      }
    },
    cancel: (): boolean => {
      if (!current) return false;
      current.abort();
      return true;
    },
  };
}

export function formatStatus(status: OllamaStatus): string {
  const label = {
    unavailable: "Ollama unavailable",
    model_missing: "Ollama connected, model unavailable",
    ready: "Ollama connected, model ready",
  }[status.state];
  return `[instaScope] ${label}. ${status.detail}`;
}

export function formatClassifyResult(result: ClassifyResult): string {
  const parts = [`${result.classified} classified`, `${result.skipped} already classified`];
  if (result.unresolved.length) parts.push(`${result.unresolved.length} unresolved`);
  if (result.failedBatches) parts.push(`${result.failedBatches} malformed batch(es)`);
  const outcome =
    result.stopReason === "completed"
      ? "done"
      : result.stopReason === "cancelled"
        ? "cancelled, completed batches are kept"
        : `stopped: ${result.error?.message ?? "request failed"}`;
  return `[instaScope] Classification ${outcome} (${parts.join(", ")}).`;
}
