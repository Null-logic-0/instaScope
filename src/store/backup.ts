import type { Classification, ListKind, ProfileRecord, Snapshot, StoreData } from "../types";

const LIST_KINDS: ReadonlySet<string> = new Set<ListKind>(["followers", "following", "likes"]);

export class BackupError extends Error {
  override name = "BackupError";
}

export function parseBackup(text: string): StoreData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("Not valid JSON");
  }
  if (!isRecord(raw)) throw new BackupError("Not an instaScope backup");
  if (raw["version"] !== 1) throw new BackupError(`Unsupported backup version: ${String(raw["version"])}`);
  if (!isRecord(raw["profiles"])) throw new BackupError("Backup has no profiles object");
  if (!Array.isArray(raw["snapshots"])) throw new BackupError("Backup has no snapshots array");

  const profiles: Record<string, ProfileRecord> = {};
  for (const [username, value] of Object.entries(raw["profiles"])) {
    const profile = parseProfile(value);
    if (!profile || profile.username !== username) throw new BackupError(`Invalid profile record: ${username}`);
    profiles[username] = profile;
  }

  const snapshots = raw["snapshots"].map((value, index) => {
    const snapshot = parseSnapshot(value);
    if (!snapshot) throw new BackupError(`Invalid snapshot at index ${index}`);
    return snapshot;
  });

  const subject = typeof raw["subject"] === "string" ? raw["subject"] : undefined;
  return { version: 1, ...(subject !== undefined && { subject }), profiles, snapshots };
}

function parseProfile(value: unknown): ProfileRecord | null {
  if (!isRecord(value)) return null;
  const { username, displayName, profileUrl, firstSeen, lastSeen, ai } = value;
  if (!isString(username) || !isString(profileUrl) || !isString(firstSeen) || !isString(lastSeen)) return null;
  if (displayName !== undefined && !isString(displayName)) return null;
  const classification = ai === undefined ? undefined : parseClassification(ai);
  if (ai !== undefined && !classification) return null;
  return {
    username,
    profileUrl,
    firstSeen,
    lastSeen,
    ...(displayName !== undefined && { displayName }),
    ...(classification && { ai: classification }),
  };
}

export function parseClassification(value: unknown): Classification | null {
  if (!isRecord(value)) return null;
  const { category, confidence, model, classifiedAt } = value;
  if (!isString(category) || !isString(model) || !isString(classifiedAt)) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return { category, confidence, model, classifiedAt };
}

function parseSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value)) return null;
  const { id, subject, kind, takenAt, usernames } = value;
  if (!isString(id) || !isString(subject) || !isString(kind) || !isString(takenAt)) return null;
  if (!LIST_KINDS.has(kind)) return null;
  if (!Array.isArray(usernames) || !usernames.every(isString)) return null;
  return { id, subject, kind: kind as ListKind, takenAt, usernames };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
