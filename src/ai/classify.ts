import type { Store } from "../store/store";
import type { ProfileRecord } from "../types";
import { OllamaClient, OllamaError } from "./ollama";

export const DEFAULT_CATEGORIES: readonly string[] = [
  "Technology",
  "Business",
  "Creator",
  "Fitness",
  "Travel",
  "Education",
  "News",
  "Personal",
  "Other",
];

export interface ClassifyOptions {
  client: OllamaClient;
  store: Store;
  usernames?: string[];
  categories?: readonly string[];
  batchSize?: number;
  force?: boolean;
  maxConsecutiveFailures?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ClassifyProgress) => void;
  now?: () => Date;
}

export interface ClassifyProgress {
  done: number;
  total: number;
  classified: number;
}

export interface ClassifyResult {
  total: number;
  classified: number;
  skipped: number;
  unresolved: string[];
  failedBatches: number;
  stopReason: "completed" | "cancelled" | "failed";
  error?: OllamaError;
}

export interface ParsedClassification {
  category: string;
  confidence: number;
}

export async function classifyProfiles(options: ClassifyOptions): Promise<ClassifyResult> {
  const {
    client,
    store,
    categories = DEFAULT_CATEGORIES,
    batchSize = 20,
    force = false,
    maxConsecutiveFailures = 3,
    signal,
    onProgress,
    now = () => new Date(),
  } = options;

  const candidates = (options.usernames ?? store.profiles().map((p) => p.username))
    .map((username) => store.profile(username))
    .filter((profile): profile is ProfileRecord => profile !== undefined);
  const pending = force ? candidates : candidates.filter((profile) => !profile.ai);
  const result: ClassifyResult = {
    total: pending.length,
    classified: 0,
    skipped: candidates.length - pending.length,
    unresolved: [],
    failedBatches: 0,
    stopReason: "completed",
  };

  const schema = classificationSchema(categories);
  const model = client.config.model;
  let done = 0;
  let consecutiveFailures = 0;

  const runBatch = async (batch: ProfileRecord[]): Promise<string[]> => {
    const expected = new Set(batch.map((p) => p.username));
    const raw = await client.chatJson({
      messages: buildMessages(batch, categories),
      format: schema,
      options: { temperature: 0 },
      signal,
    });
    const { valid } = parseClassificationResponse(raw, expected, categories);
    const classifiedAt = now().toISOString();
    for (const [username, parsed] of valid) {
      store.setClassification(username, { ...parsed, model, classifiedAt });
    }
    store.save();
    result.classified += valid.size;
    return batch.map((p) => p.username).filter((username) => !valid.has(username));
  };

  const passes: ProfileRecord[][] = [pending];
  for (let pass = 0; pass < passes.length; pass += 1) {
    const unresolved: string[] = [];
    for (const batch of chunks(passes[pass] ?? [], batchSize)) {
      if (signal?.aborted) return finish(result, "cancelled");
      try {
        unresolved.push(...(await runBatch(batch)));
        consecutiveFailures = 0;
      } catch (error) {
        if (!(error instanceof OllamaError)) throw error;
        if (error.kind === "cancelled") return finish(result, "cancelled");
        if (error.kind !== "bad_response") return finish(result, "failed", error);
        result.failedBatches += 1;
        consecutiveFailures += 1;
        unresolved.push(...batch.map((p) => p.username));
        if (consecutiveFailures >= maxConsecutiveFailures) {
          result.unresolved = unresolved;
          return finish(result, "failed", error);
        }
      }
      if (pass === 0) {
        done += batch.length;
        onProgress?.({ done, total: pending.length, classified: result.classified });
      }
    }
    if (pass === 0 && unresolved.length > 0) {
      passes.push(unresolved.map((username) => store.profile(username)).filter((p): p is ProfileRecord => !!p));
    } else {
      result.unresolved = unresolved;
    }
  }
  return result;
}

export function classificationSchema(categories: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      profiles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            username: { type: "string" },
            category: { type: "string", enum: [...categories] },
            confidence: { type: "number" },
          },
          required: ["username", "category", "confidence"],
        },
      },
    },
    required: ["profiles"],
  };
}

export function buildMessages(batch: readonly ProfileRecord[], categories: readonly string[]) {
  const lines = batch.map(
    (profile, index) =>
      `${index + 1}. username: ${profile.username}, display name: ${profile.displayName ? clip(profile.displayName) : "(none)"}`,
  );
  return [
    {
      role: "system" as const,
      content:
        `You classify Instagram accounts into exactly one of these categories: ${categories.join(", ")}. ` +
        "You only know each account's username and display name; judge from those alone. " +
        `When the name gives no clear signal, answer "${categories[categories.length - 1]}" with low confidence. ` +
        "confidence is a number from 0 to 1. Return one entry per account, using the username exactly as given. " +
        "Respond with JSON only.",
    },
    { role: "user" as const, content: `Classify these ${batch.length} accounts:\n${lines.join("\n")}` },
  ];
}

export function parseClassificationResponse(
  raw: unknown,
  expected: ReadonlySet<string>,
  categories: readonly string[],
): { valid: Map<string, ParsedClassification>; invalid: number } {
  const valid = new Map<string, ParsedClassification>();
  let invalid = 0;
  const entries = isRecord(raw) && Array.isArray(raw["profiles"]) ? raw["profiles"] : [];
  const canonical = new Map(categories.map((category) => [category.toLowerCase(), category]));

  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry["username"] !== "string" || typeof entry["category"] !== "string") {
      invalid += 1;
      continue;
    }
    const username = entry["username"].trim().replace(/^@/, "").toLowerCase();
    const category = canonical.get(entry["category"].trim().toLowerCase());
    const confidence = entry["confidence"];
    if (
      !expected.has(username) ||
      valid.has(username) ||
      category === undefined ||
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      invalid += 1;
      continue;
    }
    valid.set(username, { category, confidence: Math.round(confidence * 100) / 100 });
  }
  return { valid, invalid };
}

function finish(result: ClassifyResult, stopReason: ClassifyResult["stopReason"], error?: OllamaError): ClassifyResult {
  return { ...result, stopReason, ...(error && { error }) };
}

function* chunks<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

function clip(text: string, max = 80): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
