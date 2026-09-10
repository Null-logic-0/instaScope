import { collect, type CollectionResult } from "../collector";
import { clickAndWaitFor } from "../core/click-and-wait";
import { findDialog } from "../instagram/discovery";
import { CANCELLED_BEFORE_START, countDialogs, type FeatureOptions } from "./follow-list";

export async function collectLikes(options: FeatureOptions = {}): Promise<CollectionResult> {
  const { document: doc = document, openTimeoutMs = 10_000, ...collectOptions } = options;

  const page = likesPage(doc);
  if (page) return collect({ ...collectOptions, root: page });

  const links = doc.querySelectorAll('a[href$="/liked_by/"]');
  const link = links.item(0);
  if (!link) throw new Error("Could not find the likes link. Open a post first.");
  if (links.length > 1) throw new Error("Several posts are on screen. Open a single post first.");

  const before = countDialogs(doc);
  const root = await clickAndWaitFor(link, {
    timeoutMs: openTimeoutMs,
    signal: collectOptions.signal,
    until: (current) => (countDialogs(current) > before ? findDialog(current) : likesPage(current)),
  });
  if (!root) return CANCELLED_BEFORE_START;
  return collect({ ...collectOptions, root });
}

function likesPage(doc: Document): Element | null {
  if (!doc.location.pathname.endsWith("/liked_by/")) return null;
  return doc.querySelector("main");
}
