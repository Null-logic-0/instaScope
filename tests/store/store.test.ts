import { describe, expect, it } from "vitest";
import { MAX_SNAPSHOTS_PER_LIST, Store, StoreError, type StorageBackend } from "../../src/store/store";
import type { User } from "../../src/types";

function memoryBackend(initial: Record<string, string> = {}): StorageBackend & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const user = (username: string, displayName?: string): User => ({
  username,
  ...(displayName !== undefined && { displayName }),
  profileUrl: `https://www.instagram.com/${username}/`,
});

const day = (n: number) => new Date(Date.UTC(2026, 8, n));

describe("Store", () => {
  it("starts empty when nothing is saved", () => {
    const store = new Store(memoryBackend());

    expect(store.data).toEqual({ version: 1, profiles: {}, snapshots: [] });
    expect(store.subjects()).toEqual([]);
  });

  it("records a snapshot as usernames and keeps profile details once", () => {
    const store = new Store(memoryBackend());

    const snapshot = store.recordSnapshot({
      subject: "me",
      kind: "followers",
      users: [user("alice", "Alice"), user("bob"), user("alice", "Alice again")],
      takenAt: day(1),
    });

    expect(snapshot).toMatchObject({ subject: "me", kind: "followers", usernames: ["alice", "bob"] });
    expect(snapshot.takenAt).toBe("2026-09-01T00:00:00.000Z");
    expect(store.profile("alice")).toEqual({
      username: "alice",
      displayName: "Alice again",
      profileUrl: "https://www.instagram.com/alice/",
      firstSeen: "2026-09-01T00:00:00.000Z",
      lastSeen: "2026-09-01T00:00:00.000Z",
    });
    expect(store.data.subject).toBe("me");
  });

  it("tracks first and last seen across snapshots", () => {
    const store = new Store(memoryBackend());
    store.recordSnapshot({ subject: "me", kind: "followers", users: [user("alice", "Alice")], takenAt: day(1) });
    store.recordSnapshot({ subject: "me", kind: "following", users: [user("alice")], takenAt: day(3) });

    expect(store.profile("alice")).toMatchObject({
      displayName: "Alice",
      firstSeen: "2026-09-01T00:00:00.000Z",
      lastSeen: "2026-09-03T00:00:00.000Z",
    });
  });

  it("keeps first/last seen and details consistent when snapshots arrive out of order", () => {
    const store = new Store(memoryBackend());
    store.recordSnapshot({ subject: "me", kind: "followers", users: [user("alice", "Newest")], takenAt: day(9) });
    store.recordSnapshot({ subject: "me", kind: "followers", users: [user("alice", "Oldest")], takenAt: day(1) });

    expect(store.profile("alice")).toMatchObject({
      displayName: "Newest",
      firstSeen: "2026-09-01T00:00:00.000Z",
      lastSeen: "2026-09-09T00:00:00.000Z",
    });
  });

  it("orders snapshots by time and exposes latest and previous per list", () => {
    const store = new Store(memoryBackend());
    store.recordSnapshot({ subject: "me", kind: "followers", users: [user("b")], takenAt: day(2) });
    store.recordSnapshot({ subject: "me", kind: "followers", users: [user("a")], takenAt: day(1) });
    store.recordSnapshot({ subject: "me", kind: "following", users: [user("c")], takenAt: day(3) });
    store.recordSnapshot({ subject: "other", kind: "followers", users: [user("d")], takenAt: day(4) });

    expect(store.latest("me", "followers")?.usernames).toEqual(["b"]);
    expect(store.previous("me", "followers")?.usernames).toEqual(["a"]);
    expect(store.previous("me", "following")).toBeUndefined();
    expect(store.subjects()).toEqual(["me", "other"]);
  });

  it("persists through the backend and reloads", () => {
    const backend = memoryBackend();
    new Store(backend).recordSnapshot({ subject: "me", kind: "followers", users: [user("alice")], takenAt: day(1) });

    const reloaded = new Store(backend);

    expect(reloaded.latest("me", "followers")?.usernames).toEqual(["alice"]);
    expect(reloaded.profile("alice")?.firstSeen).toBe("2026-09-01T00:00:00.000Z");
  });

  it("works with the browser's localStorage", () => {
    localStorage.clear();
    new Store(localStorage).recordSnapshot({ subject: "me", kind: "likes", users: [user("alice")], takenAt: day(1) });

    expect(new Store(localStorage).latest("me", "likes")?.usernames).toEqual(["alice"]);
    localStorage.clear();
  });

  it("keeps a corrupt value aside instead of failing", () => {
    const backend = memoryBackend({ "instascope:v1": "{not json" });

    const store = new Store(backend);

    expect(store.data.snapshots).toEqual([]);
    expect(backend.data.get("instascope:v1:corrupt")).toBe("{not json");
  });

  it("keeps only the newest snapshots per list", () => {
    const store = new Store(memoryBackend());
    for (let i = 1; i <= MAX_SNAPSHOTS_PER_LIST + 5; i++) {
      store.recordSnapshot({ subject: "me", kind: "followers", users: [user(`u${i}`)], takenAt: day(i) });
    }
    store.recordSnapshot({ subject: "me", kind: "following", users: [user("f")], takenAt: day(1) });

    expect(store.snapshots("me", "followers")).toHaveLength(MAX_SNAPSHOTS_PER_LIST);
    expect(store.snapshots("me", "followers")[0]?.usernames).toEqual(["u6"]);
    expect(store.snapshots("me", "following")).toHaveLength(1);
  });

  it("stores and clears classifications on known profiles only", () => {
    const store = new Store(memoryBackend());
    store.recordSnapshot({ subject: "me", kind: "followers", users: [user("alice")], takenAt: day(1) });
    const classification = { category: "Fitness", confidence: 0.9, model: "gemma3:1b", classifiedAt: "2026-09-02T00:00:00.000Z" };

    expect(store.setClassification("alice", classification)).toBe(true);
    expect(store.setClassification("nobody", classification)).toBe(false);
    expect(store.profile("alice")?.ai).toEqual(classification);
    expect(store.clearClassifications()).toBe(1);
    expect(store.profile("alice")?.ai).toBeUndefined();
  });

  it("surfaces a full storage as a StoreError", () => {
    const backend = memoryBackend();
    backend.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };

    expect(() => new Store(backend).recordSnapshot({ subject: "me", kind: "followers", users: [] })).toThrow(StoreError);
  });
});

describe("Store backup", () => {
  it("round-trips through JSON", () => {
    const source = new Store(memoryBackend());
    source.recordSnapshot({ subject: "me", kind: "followers", users: [user("alice", "Alice")], takenAt: day(1) });
    source.setClassification("alice", { category: "Creator", confidence: 0.8, model: "m", classifiedAt: "2026-09-02T00:00:00.000Z" });
    source.save();

    const target = new Store(memoryBackend());
    const imported = target.importJson(source.exportJson());

    expect(imported).toEqual({ profiles: 1, snapshots: 1 });
    expect(target.data).toEqual(source.data);
  });

  it("merges rather than replaces: earliest first seen, latest details, newest classification", () => {
    const store = new Store(memoryBackend());
    store.recordSnapshot({ subject: "me", kind: "followers", users: [user("alice", "Old name")], takenAt: day(5) });
    store.setClassification("alice", { category: "Other", confidence: 0.5, model: "m", classifiedAt: "2026-09-05T00:00:00.000Z" });

    const other = new Store(memoryBackend());
    other.recordSnapshot({ subject: "me", kind: "followers", users: [user("alice", "New name"), user("bob")], takenAt: day(9) });
    other.recordSnapshot({ subject: "me", kind: "followers", users: [user("alice")], takenAt: day(1) });
    other.setClassification("alice", { category: "Creator", confidence: 0.9, model: "m", classifiedAt: "2026-09-09T00:00:00.000Z" });
    other.save();

    const imported = store.importJson(other.exportJson());

    expect(imported).toEqual({ profiles: 1, snapshots: 2 });
    expect(store.profile("alice")).toMatchObject({
      displayName: "New name",
      firstSeen: "2026-09-01T00:00:00.000Z",
      lastSeen: "2026-09-09T00:00:00.000Z",
      ai: { category: "Creator" },
    });
    expect(store.snapshots("me", "followers").map((s) => s.takenAt.slice(0, 10))).toEqual([
      "2026-09-01",
      "2026-09-05",
      "2026-09-09",
    ]);
  });

  it("ignores snapshots it already has", () => {
    const store = new Store(memoryBackend());
    store.recordSnapshot({ subject: "me", kind: "followers", users: [user("alice")], takenAt: day(1) });

    expect(store.importJson(store.exportJson())).toEqual({ profiles: 0, snapshots: 0 });
    expect(store.snapshots("me", "followers")).toHaveLength(1);
  });

  it.each([
    ["not json", "{"],
    ["a plain users array", JSON.stringify([{ username: "alice" }])],
    ["an unsupported version", JSON.stringify({ version: 2, profiles: {}, snapshots: [] })],
    ["an invalid profile", JSON.stringify({ version: 1, profiles: { alice: { username: "alice" } }, snapshots: [] })],
    [
      "a mismatched profile key",
      JSON.stringify({
        version: 1,
        profiles: { alice: { username: "bob", profileUrl: "u", firstSeen: "t", lastSeen: "t" } },
        snapshots: [],
      }),
    ],
    [
      "an invalid snapshot kind",
      JSON.stringify({ version: 1, profiles: {}, snapshots: [{ id: "x", subject: "me", kind: "friends", takenAt: "t", usernames: [] }] }),
    ],
    [
      "an out-of-range confidence",
      JSON.stringify({
        version: 1,
        profiles: {
          alice: {
            username: "alice",
            profileUrl: "u",
            firstSeen: "t",
            lastSeen: "t",
            ai: { category: "X", confidence: 1.5, model: "m", classifiedAt: "t" },
          },
        },
        snapshots: [],
      }),
    ],
  ])("rejects %s", (_label, text) => {
    expect(() => new Store(memoryBackend()).importJson(text)).toThrow(/backup|JSON|Invalid|version/i);
  });
});
