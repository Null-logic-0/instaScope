import type { DatasetRow } from "../analytics";
import type { User } from "../types";
import { serializeCsv, type CsvColumn } from "./csv";

const DATASET_COLUMNS: readonly CsvColumn<DatasetRow>[] = [
  { header: "username", value: (row) => row.username },
  { header: "display_name", value: (row) => row.displayName },
  { header: "profile_url", value: (row) => row.profileUrl },
  { header: "relationship", value: (row) => row.relationship },
  { header: "first_seen", value: (row) => row.firstSeen },
  { header: "last_seen", value: (row) => row.lastSeen },
];

const AI_COLUMNS: readonly CsvColumn<DatasetRow>[] = [
  { header: "category", value: (row) => row.category },
  { header: "confidence", value: (row) => row.confidence },
];

export function datasetToCsv(rows: DatasetRow[]): string {
  const classified = rows.some((row) => row.category !== undefined);
  return serializeCsv(rows, classified ? [...DATASET_COLUMNS, ...AI_COLUMNS] : DATASET_COLUMNS);
}

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
