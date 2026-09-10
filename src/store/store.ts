import type { Classification, ListKind, ProfileRecord, Snapshot, StoreData, User } from "../types";
import { parseBackup } from "./backup";

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORE_KEY = "instascope:v1";
export const MAX_SNAPSHOTS_PER_LIST = 30;

export class StoreError extends Error {
  override name = "StoreError";
}

export interface SnapshotInput {
  subject: string;
  kind: ListKind;
  users: User[];
  takenAt?: Date;
}

export class Store {
  readonly #backend: StorageBackend;
  readonly #key: string;
  #data: StoreData;

  constructor(backend: StorageBackend, key = STORE_KEY) {
    this.#backend = backend;
    this.#key = key;
    this.#data = load(backend, key);
  }

  get data(): StoreData {
    return this.#data;
  }

  recordSnapshot({ subject, kind, users, takenAt = new Date() }: SnapshotInput): Snapshot {
    const at = takenAt.toISOString();
    const usernames = new Set<string>();
    for (const user of users) {
      usernames.add(user.username);
      touchProfile(this.#data.profiles, user, at);
    }

    const snapshot: Snapshot = { id: `${kind}:${subject}:${at}`, subject, kind, takenAt: at, usernames: [...usernames] };
    this.#data.snapshots.push(snapshot);
    this.#data.snapshots = prune(this.#data.snapshots);
    this.#data.subject = subject;
    this.save();
    return snapshot;
  }

  snapshots(subject: string, kind: ListKind): Snapshot[] {
    return this.#data.snapshots
      .filter((snapshot) => snapshot.subject === subject && snapshot.kind === kind)
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  }

  latest(subject: string, kind: ListKind): Snapshot | undefined {
    return this.snapshots(subject, kind).at(-1);
  }

  previous(subject: string, kind: ListKind): Snapshot | undefined {
    return this.snapshots(subject, kind).at(-2);
  }

  subjects(): string[] {
    return [...new Set(this.#data.snapshots.map((snapshot) => snapshot.subject))];
  }

  profile(username: string): ProfileRecord | undefined {
    return this.#data.profiles[username];
  }

  profiles(): ProfileRecord[] {
    return Object.values(this.#data.profiles);
  }

  setClassification(username: string, classification: Classification): boolean {
    const profile = this.#data.profiles[username];
    if (!profile) return false;
    profile.ai = classification;
    return true;
  }

  clearClassifications(): number {
    let cleared = 0;
    for (const profile of this.profiles()) {
      if (profile.ai) {
        delete profile.ai;
        cleared += 1;
      }
    }
    this.save();
    return cleared;
  }

  exportJson(): string {
    return JSON.stringify(this.#data, null, 2);
  }

  importJson(text: string): { profiles: number; snapshots: number } {
    const incoming = parseBackup(text);
    let profiles = 0;
    let snapshots = 0;

    for (const profile of Object.values(incoming.profiles)) {
      if (mergeProfile(this.#data.profiles, profile)) profiles += 1;
    }
    const known = new Set(this.#data.snapshots.map((snapshot) => snapshot.id));
    for (const snapshot of incoming.snapshots) {
      if (known.has(snapshot.id)) continue;
      this.#data.snapshots.push(snapshot);
      snapshots += 1;
    }
    this.#data.snapshots = prune(this.#data.snapshots);
    this.#data.subject ??= incoming.subject;
    this.save();
    return { profiles, snapshots };
  }

  save(): void {
    try {
      this.#backend.setItem(this.#key, JSON.stringify(this.#data));
    } catch (error) {
      throw new StoreError(
        `Could not save to local storage (${String(error)}). Export a JSON backup and clear old snapshots.`,
      );
    }
  }
}

export function emptyStore(): StoreData {
  return { version: 1, profiles: {}, snapshots: [] };
}

function load(backend: StorageBackend, key: string): StoreData {
  const raw = backend.getItem(key);
  if (raw === null) return emptyStore();
  try {
    return parseBackup(raw);
  } catch {
    backend.setItem(`${key}:corrupt`, raw);
    return emptyStore();
  }
}

function touchProfile(profiles: Record<string, ProfileRecord>, user: User, at: string): void {
  const existing = profiles[user.username];
  if (!existing) {
    profiles[user.username] = { ...user, firstSeen: at, lastSeen: at };
    return;
  }
  if (at < existing.firstSeen) existing.firstSeen = at;
  if (at >= existing.lastSeen) {
    existing.lastSeen = at;
    existing.profileUrl = user.profileUrl;
    if (user.displayName !== undefined) existing.displayName = user.displayName;
  }
}

function mergeProfile(profiles: Record<string, ProfileRecord>, incoming: ProfileRecord): boolean {
  const existing = profiles[incoming.username];
  if (!existing) {
    profiles[incoming.username] = { ...incoming };
    return true;
  }
  const incomingIsNewer = incoming.lastSeen > existing.lastSeen;
  if (incoming.firstSeen < existing.firstSeen) existing.firstSeen = incoming.firstSeen;
  if (incomingIsNewer) {
    existing.lastSeen = incoming.lastSeen;
    existing.profileUrl = incoming.profileUrl;
    if (incoming.displayName !== undefined) existing.displayName = incoming.displayName;
  }
  if (incoming.ai && (!existing.ai || incoming.ai.classifiedAt > existing.ai.classifiedAt)) {
    existing.ai = incoming.ai;
  }
  return false;
}

function prune(snapshots: Snapshot[]): Snapshot[] {
  const byList = new Map<string, Snapshot[]>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.kind}:${snapshot.subject}`;
    byList.set(key, [...(byList.get(key) ?? []), snapshot]);
  }
  const kept = new Set<Snapshot>();
  for (const list of byList.values()) {
    list.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    for (const snapshot of list.slice(-MAX_SNAPSHOTS_PER_LIST)) kept.add(snapshot);
  }
  return snapshots.filter((snapshot) => kept.has(snapshot));
}
