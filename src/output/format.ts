import type { User } from "../types";
import { serializeCsv, type CsvColumn } from "./csv";

export const USER_COLUMNS: readonly CsvColumn<User>[] = [
  { header: "username", value: (user) => user.username },
  { header: "display_name", value: (user) => user.displayName },
  { header: "profile_url", value: (user) => user.profileUrl },
];

export function toJson(users: User[]): string {
  return JSON.stringify(users, null, 2);
}

export function toCsv(users: User[]): string {
  return serializeCsv(users, USER_COLUMNS);
}
