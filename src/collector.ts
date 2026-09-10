import { readScrollPosition, scrollForward } from "./core/scrolling";
import { UserSet } from "./core/user-set";
import { isHidden, waitUntilVisible } from "./core/visibility";
import { waitForChange } from "./core/wait-for-change";
import { discoverList } from "./instagram/discovery";
import { extractUsers } from "./instagram/extraction";
import { hasLoadingIndicator } from "./instagram/loading";
import type { User } from "./types";

export type StopReason = "end_of_list" | "target_reached" | "stalled" | "cancelled";

export interface CollectionResult {
  users: User[];
  stopReason: StopReason;
  rounds: number;
}

export interface Progress {
  collected: number;
  round: number;
  atBottom: boolean;
}

export interface Timing {
  settleMs: number;
  loadTimeoutMs: number;
  confirmTimeoutMs: number;
}

export type RootResolver = () => Element | null;

export interface CollectOptions {
  root: Element | RootResolver;
  document?: Document;
  maxUsers?: number;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
  timing?: Partial<Timing>;
}

export class CollectionError extends Error {
  constructor(
    message: string,
    readonly users: User[],
  ) {
    super(message);
    this.name = "CollectionError";
  }
}

export const DEFAULT_TIMING: Timing = {
  settleMs: 150,
  loadTimeoutMs: 8000,
  confirmTimeoutMs: 1500,
};

export async function collect(options: CollectOptions): Promise<CollectionResult> {
  const { maxUsers = Infinity, signal, onProgress, document: doc = document } = options;
  const timing = { ...DEFAULT_TIMING, ...options.timing };
  const rootOption = options.root;
  const resolveRoot: RootResolver = typeof rootOption === "function" ? rootOption : () => rootOption;
  const users = new UserSet();
  let round = 0;
  let stuckSince: number | null = null;
  let missingSince: number | null = null;

  const done = (stopReason: StopReason): CollectionResult => ({
    users: users.toArray().slice(0, maxUsers),
    stopReason,
    rounds: round,
  });

  while (true) {
    if (signal?.aborted) return done("cancelled");
    if (isHidden(doc)) {
      const outcome = await waitUntilVisible(doc, signal);
      if (outcome === "aborted") return done("cancelled");
      stuckSince = null;
      missingSince = null;
    }
    round += 1;

    const root = connected(resolveRoot());
    const found = root ? discoverList(root) : null;
    if (!found) {
      missingSince ??= Date.now();
      const remaining = timing.loadTimeoutMs - (Date.now() - missingSince);
      if (remaining <= 0) {
        if (users.size === 0) return done("end_of_list");
        throw new CollectionError(
          root ? "The list has no rows any more" : "The list is no longer in the document",
          users.toArray(),
        );
      }
      const outcome = await waitForChange(doc.body, { timeoutMs: remaining, signal });
      if (outcome === "aborted") return done("cancelled");
      continue;
    }
    missingSince = null;

    const added = users.addAll(extractUsers(found.rows));
    const position = readScrollPosition(found.scrollContainer);
    onProgress?.({ collected: users.size, round, atBottom: position.atBottom });
    if (users.size >= maxUsers) return done("target_reached");

    if (!position.atBottom) {
      stuckSince = null;
      scrollForward(found.scrollContainer);
      const outcome = await waitForChange(found.scrollContainer, { timeoutMs: timing.settleMs, signal });
      if (outcome === "aborted") return done("cancelled");
      continue;
    }

    const now = Date.now();
    if (added > 0) stuckSince = null;
    stuckSince ??= now;
    const loading = hasLoadingIndicator(found);
    const patience = loading ? timing.loadTimeoutMs : timing.confirmTimeoutMs;
    const remaining = patience - (now - stuckSince);
    if (remaining <= 0) return done(loading ? "stalled" : "end_of_list");

    const outcome = await waitForChange(found.scrollContainer, { timeoutMs: remaining, signal });
    if (outcome === "aborted") return done("cancelled");
  }
}

function connected(element: Element | null): Element | null {
  return element?.isConnected ? element : null;
}
