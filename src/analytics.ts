import type { Store } from "./store/store";
import type { ListKind, ProfileRecord, Snapshot } from "./types";

export type Relationship = "mutual" | "follower" | "following";

export const DATASETS = [
  "followers",
  "following",
  "mutuals",
  "not-following-back",
  "fans",
  "new-followers",
  "lost-followers",
  "snapshot",
] as const;

export type Dataset = (typeof DATASETS)[number];

export interface DatasetRow {
  username: string;
  displayName?: string;
  profileUrl: string;
  relationship?: Relationship;
  firstSeen: string;
  lastSeen: string;
  category?: string;
  confidence?: number;
}

export interface Stats {
  subject: string;
  followers: number | null;
  following: number | null;
  mutuals: number | null;
  notFollowingBack: number | null;
  fans: number | null;
  newFollowers: number | null;
  lostFollowers: number | null;
  followersTakenAt: string | null;
  previousFollowersTakenAt: string | null;
  followingTakenAt: string | null;
}

export class AnalyticsError extends Error {
  override name = "AnalyticsError";
}

export function buildDataset(store: Store, subject: string, dataset: Dataset): DatasetRow[] {
  const relationship = relationships(store, subject);
  const row = (username: string): DatasetRow | null => {
    const profile = store.profile(username);
    return profile ? toRow(profile, relationship.get(username)) : null;
  };
  const rows = (usernames: Iterable<string>) => [...usernames].map(row).filter((r): r is DatasetRow => r !== null);

  switch (dataset) {
    case "followers":
      return rows(require(store, subject, "followers").usernames);
    case "following":
      return rows(require(store, subject, "following").usernames);
    case "mutuals":
    case "fans": {
      const followers = require(store, subject, "followers");
      const following = new Set(require(store, subject, "following").usernames);
      const wanted = dataset === "mutuals";
      return rows(followers.usernames.filter((u) => following.has(u) === wanted));
    }
    case "not-following-back": {
      const followers = new Set(require(store, subject, "followers").usernames);
      return rows(require(store, subject, "following").usernames.filter((u) => !followers.has(u)));
    }
    case "new-followers":
    case "lost-followers": {
      const [previous, latest] = requirePair(store, subject);
      const [from, to] = dataset === "new-followers" ? [previous, latest] : [latest, previous];
      const seen = new Set(from.usernames);
      return rows(to.usernames.filter((u) => !seen.has(u)));
    }
    case "snapshot": {
      const followers = store.latest(subject, "followers");
      const following = store.latest(subject, "following");
      if (!followers && !following) throw missing(subject, "followers");
      const usernames = new Set([...(followers?.usernames ?? []), ...(following?.usernames ?? [])]);
      return rows(usernames);
    }
  }
}

export function computeStats(store: Store, subject: string): Stats {
  const followers = store.latest(subject, "followers");
  const previous = store.previous(subject, "followers");
  const following = store.latest(subject, "following");
  const both = followers && following;
  const followerSet = new Set(followers?.usernames);
  const followingSet = new Set(following?.usernames);
  const previousSet = new Set(previous?.usernames);

  return {
    subject,
    followers: followers ? followers.usernames.length : null,
    following: following ? following.usernames.length : null,
    mutuals: both ? followers.usernames.filter((u) => followingSet.has(u)).length : null,
    notFollowingBack: both ? following.usernames.filter((u) => !followerSet.has(u)).length : null,
    fans: both ? followers.usernames.filter((u) => !followingSet.has(u)).length : null,
    newFollowers: followers && previous ? followers.usernames.filter((u) => !previousSet.has(u)).length : null,
    lostFollowers: followers && previous ? previous.usernames.filter((u) => !followerSet.has(u)).length : null,
    followersTakenAt: followers?.takenAt ?? null,
    previousFollowersTakenAt: previous?.takenAt ?? null,
    followingTakenAt: following?.takenAt ?? null,
  };
}

export function datasetFilename(dataset: Dataset, date = new Date()): string {
  return dataset === "snapshot" ? `snapshot-${date.toISOString().slice(0, 10)}.csv` : `${dataset}.csv`;
}

export function relationships(store: Store, subject: string): Map<string, Relationship> {
  const followers = store.latest(subject, "followers");
  const following = store.latest(subject, "following");
  const map = new Map<string, Relationship>();
  if (!followers || !following) return map;

  const followingSet = new Set(following.usernames);
  for (const username of followers.usernames) {
    map.set(username, followingSet.has(username) ? "mutual" : "follower");
  }
  for (const username of following.usernames) {
    if (!map.has(username)) map.set(username, "following");
  }
  return map;
}

function toRow(profile: ProfileRecord, relationship: Relationship | undefined): DatasetRow {
  return {
    username: profile.username,
    ...(profile.displayName !== undefined && { displayName: profile.displayName }),
    profileUrl: profile.profileUrl,
    ...(relationship !== undefined && { relationship }),
    firstSeen: profile.firstSeen,
    lastSeen: profile.lastSeen,
    ...(profile.ai && { category: profile.ai.category, confidence: profile.ai.confidence }),
  };
}

function require(store: Store, subject: string, kind: ListKind): Snapshot {
  const snapshot = store.latest(subject, kind);
  if (!snapshot) throw missing(subject, kind);
  return snapshot;
}

function requirePair(store: Store, subject: string): [Snapshot, Snapshot] {
  const previous = store.previous(subject, "followers");
  const latest = store.latest(subject, "followers");
  if (!previous || !latest) {
    throw new AnalyticsError(
      `New and lost followers need two followers snapshots of ${subject}; run collectFollowers() again later.`,
    );
  }
  return [previous, latest];
}

function missing(subject: string, kind: ListKind): AnalyticsError {
  const call = kind === "likes" ? "collectLikes()" : kind === "followers" ? "collectFollowers()" : "collectFollowing()";
  return new AnalyticsError(`No ${kind} snapshot of ${subject} yet; run ${call} first.`);
}
