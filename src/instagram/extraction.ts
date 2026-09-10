import type { User } from "../types";
import { parseProfileHref, profileUrl } from "./profile-link";


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

function findDisplayName(row: Element): string | undefined {
  for (const span of row.querySelectorAll('span[dir="auto"]')) {
    if (span.closest("a, button") !== null) continue;
    const text = span.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}
