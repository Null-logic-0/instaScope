import { parseProfileHref } from "./profile-link";

export interface DiscoveredList {
  list: Element;
  rows: Element[];
  scrollContainer: Element;
}


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
