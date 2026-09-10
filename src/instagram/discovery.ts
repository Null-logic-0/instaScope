import { parseProfileHref } from "./profile-link";

export interface DiscoveredList {
  // Parent element of the rows. Rows are appended here as Instagram loads more.
  list: Element;
  // Children of `list` that contain a profile link, in document order.
  rows: Element[];
  // Element whose scrollTop drives loading; document.scrollingElement for pages.
  scrollContainer: Element;
}

// Instagram stacks dialogs (post modal, then its likes dialog); the last one in
// document order is the one on top.
export function findDialog(doc: Document): Element | null {
  const dialogs = doc.querySelectorAll('[role="dialog"]');
  return dialogs[dialogs.length - 1] ?? null;
}

export function profileAnchors(root: Element): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]")).filter(
    (anchor) => parseProfileHref(anchor.getAttribute("href")) !== null,
  );
}

function distinctUsernames(element: Element): number {
  const usernames = new Set<string>();
  for (const anchor of element.querySelectorAll("a[href]")) {
    const username = parseProfileHref(anchor.getAttribute("href"));
    if (username !== null) usernames.add(username);
  }
  return usernames.size;
}

// Locates the user list inside `root` without relying on class names:
// a row is the highest ancestor of the first profile link that still contains
// exactly one username, and the list is that row's parent. Starting from the
// first link means sections that follow the list, such as the followers
// dialog's "Suggested for you", are excluded because their rows have a
// different parent. Returns null when no profile link exists yet.
export function discoverList(root: Element): DiscoveredList | null {
  const first = profileAnchors(root)[0];
  if (!first) return null;

  let row: Element = first;
  while (
    row.parentElement &&
    row.parentElement !== root &&
    distinctUsernames(row.parentElement) <= 1
  ) {
    row = row.parentElement;
  }

  const list = row.parentElement ?? root;
  const rows = Array.from(list.children).filter((child) => profileAnchors(child).length > 0);
  return { list, rows, scrollContainer: findScrollContainer(list) };
}

// Nearest ancestor that both allows scrolling and currently overflows. Instagram
// wraps the list in an element that also has overflow-y: auto but never
// overflows, so the style alone is not enough. When nothing overflows yet, the
// nearest scrollable-by-style ancestor is returned so a caller has something
// to re-check later; lists rendered directly on a page fall back to the
// document's scrolling element.
export function findScrollContainer(from: Element): Element {
  const doc = from.ownerDocument;
  const view = doc.defaultView;
  let fallback: Element | null = null;

  for (let node: Element | null = from; node; node = node.parentElement) {
    const overflowY = view?.getComputedStyle(node).overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll") continue;
    if (node.scrollHeight > node.clientHeight) return node;
    fallback ??= node;
  }

  return fallback ?? doc.scrollingElement ?? doc.documentElement;
}
