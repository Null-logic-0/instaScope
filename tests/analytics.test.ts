import { describe, expect, it } from "vitest";
import { AnalyticsError, buildDataset, computeStats, datasetFilename, relationships } from "../src/analytics";
import { datasetToCsv } from "../src/output/format";
import { Store } from "../src/store/store";
import type { User } from "../src/types";

const user = (username: string): User => ({ username, profileUrl: `https://www.instagram.com/${username}/` });
const users = (...names: string[]) => names.map(user);
const day = (n: number) => new Date(Date.UTC(2026, 8, n));
const names = (rows: { username: string }[]) => rows.map((row) => row.username);

function memoryStore(): Store {
  const data = new Map<string, string>();
  return new Store({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) });
}

function accountWithHistory(): Store {
  const store = memoryStore();
  store.recordSnapshot({ subject: "me", kind: "followers", users: users("ann", "ben", "cat", "dan"), takenAt: day(1) });
  store.recordSnapshot({ subject: "me", kind: "followers", users: users("ann", "ben", "eve", "fay"), takenAt: day(5) });
  store.recordSnapshot({ subject: "me", kind: "following", users: users("ben", "eve", "gus"), takenAt: day(5) });
  return store;
}

describe("buildDataset", () => {
  it.each([
    ["followers", ["ann", "ben", "eve", "fay"]],
    ["following", ["ben", "eve", "gus"]],
    ["mutuals", ["ben", "eve"]],
    ["fans", ["ann", "fay"]],
    ["not-following-back", ["gus"]],
    ["new-followers", ["eve", "fay"]],
    ["lost-followers", ["cat", "dan"]],
    ["snapshot", ["ann", "ben", "eve", "fay", "gus"]],
  ] as const)("%s", (dataset, expected) => {
    expect(names(buildDataset(accountWithHistory(), "me", dataset))).toEqual(expected);
  });

  it("labels each row with its relationship and sighting dates", () => {
    const rows = buildDataset(accountWithHistory(), "me", "snapshot");

    expect(rows.map((row) => [row.username, row.relationship])).toEqual([
      ["ann", "follower"],
      ["ben", "mutual"],
      ["eve", "mutual"],
      ["fay", "follower"],
      ["gus", "following"],
    ]);
    expect(rows[0]).toMatchObject({ firstSeen: "2026-09-01T00:00:00.000Z", lastSeen: "2026-09-05T00:00:00.000Z" });
  });

  it("leaves the relationship out when only one list was collected", () => {
    const store = memoryStore();
    store.recordSnapshot({ subject: "me", kind: "followers", users: users("ann"), takenAt: day(1) });

    expect(buildDataset(store, "me", "followers")[0]?.relationship).toBeUndefined();
    expect(relationships(store, "me").size).toBe(0);
  });

  it("carries AI classifications into rows", () => {
    const store = accountWithHistory();
    store.setClassification("ann", { category: "Creator", confidence: 0.8, model: "m", classifiedAt: "t" });

    expect(buildDataset(store, "me", "followers")[0]).toMatchObject({ category: "Creator", confidence: 0.8 });
    expect(buildDataset(store, "me", "followers")[1]?.category).toBeUndefined();
  });

  it("explains which collection is missing", () => {
    const store = memoryStore();
    store.recordSnapshot({ subject: "me", kind: "followers", users: users("ann"), takenAt: day(1) });

    expect(() => buildDataset(store, "me", "mutuals")).toThrow(/No following snapshot of me yet; run collectFollowing\(\)/);
    expect(() => buildDataset(store, "me", "new-followers")).toThrow(AnalyticsError);
    expect(() => buildDataset(store, "nobody", "snapshot")).toThrow(/No followers snapshot of nobody/);
  });
});

describe("computeStats", () => {
  it("counts every relationship deterministically", () => {
    expect(computeStats(accountWithHistory(), "me")).toEqual({
      subject: "me",
      followers: 4,
      following: 3,
      mutuals: 2,
      notFollowingBack: 1,
      fans: 2,
      newFollowers: 2,
      lostFollowers: 2,
      followersTakenAt: "2026-09-05T00:00:00.000Z",
      previousFollowersTakenAt: "2026-09-01T00:00:00.000Z",
      followingTakenAt: "2026-09-05T00:00:00.000Z",
    });
  });

  it("reports null for anything that cannot be computed yet", () => {
    const store = memoryStore();
    store.recordSnapshot({ subject: "me", kind: "followers", users: users("ann"), takenAt: day(1) });

    expect(computeStats(store, "me")).toMatchObject({
      followers: 1,
      following: null,
      mutuals: null,
      newFollowers: null,
      previousFollowersTakenAt: null,
    });
  });
});

describe("datasetToCsv", () => {
  it("omits the AI columns until something is classified", () => {
    const store = accountWithHistory();

    expect(datasetToCsv(buildDataset(store, "me", "mutuals")).split("\r\n")[0]).toBe(
      "username,display_name,profile_url,relationship,first_seen,last_seen",
    );

    store.setClassification("ben", { category: "Business", confidence: 0.91, model: "m", classifiedAt: "t" });
    const lines = datasetToCsv(buildDataset(store, "me", "mutuals")).split("\r\n");

    expect(lines[0]).toBe("username,display_name,profile_url,relationship,first_seen,last_seen,category,confidence");
    expect(lines[1]).toBe(
      "ben,,https://www.instagram.com/ben/,mutual,2026-09-01T00:00:00.000Z,2026-09-05T00:00:00.000Z,Business,0.91",
    );
    expect(lines[2]).toBe("eve,,https://www.instagram.com/eve/,mutual,2026-09-05T00:00:00.000Z,2026-09-05T00:00:00.000Z,,");
  });
});

describe("datasetFilename", () => {
  it("names files after the dataset, dating snapshots", () => {
    expect(datasetFilename("not-following-back")).toBe("not-following-back.csv");
    expect(datasetFilename("snapshot", day(10))).toBe("snapshot-2026-09-10.csv");
  });
});
