import type { User } from "../types";
import { parseProfileHref, profileUrl } from "./profile-link";

// Reads one user from a list row. The username comes from the first profile
// link's href, never from its text: the verified badge inside the anchor
// leaks "Verified" into textContent. Returns null for a row without a
// profile link.
export function extractUser(row: Element): User | null {
  const username = firstUsername(row);
  if (username === null) return null;

  const displayName = findDisplayName(row);
  return {
    username,
    ...(displayName !== undefined && { displayName }),
    profileUrl: profileUrl(username),
  };
}

export function extractUsers(rows: Iterable<Element>): User[] {
  const users: User[] = [];
  for (const row of rows) {
    const user = extractUser(row);
    if (user !== null) users.push(user);
  }
  return users;
}

function firstUsername(row: Element): string | null {
  for (const anchor of row.querySelectorAll("a[href]")) {
    const username = parseProfileHref(anchor.getAttribute("href"));
    if (username !== null) return username;
  }
  return null;
}

// Instagram renders the display name as a span[dir="auto"] that sits outside
// the username anchor and the follow button; the username's own span is
// inside the anchor and the button label is a div.
function findDisplayName(row: Element): string | undefined {
  for (const span of row.querySelectorAll('span[dir="auto"]')) {
    if (span.closest("a, button") !== null) continue;
    const text = span.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}
