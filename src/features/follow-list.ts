import { collect, type CollectionResult, type CollectOptions } from "../collector";
import { clickAndWaitFor } from "../core/click-and-wait";
import { findDialog } from "../instagram/discovery";
import { findProfileStats, type ProfileStats } from "../instagram/profile-header";

export interface FeatureOptions extends Omit<CollectOptions, "root"> {
  document?: Document;
  openTimeoutMs?: number;
}

export const CANCELLED_BEFORE_START: CollectionResult = { users: [], stopReason: "cancelled", rounds: 0 };

export function collectFollowers(options: FeatureOptions = {}): Promise<CollectionResult> {
  return collectFollowList("followers", options);
}

export function collectFollowing(options: FeatureOptions = {}): Promise<CollectionResult> {
  return collectFollowList("following", options);
}

async function collectFollowList(
  kind: keyof ProfileStats,
  options: FeatureOptions,
): Promise<CollectionResult> {
  const { document: doc = document, openTimeoutMs = 10_000, ...collectOptions } = options;

  const stats = findProfileStats(doc);
  if (!stats) {
    throw new Error(
      `Could not find the ${kind} count in the profile header. Open a profile whose ${kind} you can view.`,
    );
  }

  const root = await openNewDialog(stats[kind], openTimeoutMs, collectOptions.signal);
  if (!root) return CANCELLED_BEFORE_START;
  return collect({ ...collectOptions, root });
}

export function countDialogs(doc: Document): number {
  return doc.querySelectorAll('[role="dialog"]').length;
}

export function openNewDialog(
  control: Element,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Element | null> {
  const before = countDialogs(control.ownerDocument);
  return clickAndWaitFor(control, {
    timeoutMs,
    signal,
    until: (doc) => (countDialogs(doc) > before ? findDialog(doc) : null),
  });
}
