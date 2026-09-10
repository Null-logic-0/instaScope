import type { User } from "../types";

export function toJson(users: User[]): string {
  return JSON.stringify(users, null, 2);
}

export function toCsv(users: User[]): string {
  const rows = [
    ["username", "display_name", "profile_url"],
    ...users.map((user) => [user.username, user.displayName ?? "", user.profileUrl]),
  ];
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

function csvField(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTING.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
