import { collect, type CollectionResult } from "../collector";
import { clickAndWaitFor } from "../core/click-and-wait";
import { findDialog } from "../instagram/discovery";
import { CANCELLED_BEFORE_START, countDialogs, type FeatureOptions } from "./follow-list";

export async function collectLikes(options: FeatureOptions = {}): Promise<CollectionResult> {
  const { document: doc = document, openTimeoutMs = 10_000, ...collectOptions } = options;

  if (likesPage(doc)) {
    return collect({ ...collectOptions, document: doc, root: () => likesPage(doc) });
  }

  const links = Array.from(doc.querySelectorAll('a[href$="/liked_by/"]'));
  const [link] = links;
  if (!link) throw new Error("Could not find the likes link. Open a post first.");
  const posts = new Set(links.map((anchor) => anchor.getAttribute("href")));
  if (posts.size > 1) throw new Error("Several posts are on screen. Open a single post first.");

  const before = countDialogs(doc);
  const likesSurface = (): Element | null =>
    countDialogs(doc) > before ? findDialog(doc) : likesPage(doc);
  const opened = await clickAndWaitFor(link, {
    timeoutMs: openTimeoutMs,
    signal: collectOptions.signal,
    until: likesSurface,
  });
  if (!opened) return CANCELLED_BEFORE_START;
  return collect({ ...collectOptions, document: doc, root: likesSurface });
}

function likesPage(doc: Document): Element | null {
  if (!doc.location.pathname.endsWith("/liked_by/")) return null;
  return doc.querySelector("main");
}
