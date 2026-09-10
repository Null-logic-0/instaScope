import { describe, expect, it } from "vitest";
import { UserSet } from "../../src/core/user-set";
import type { User } from "../../src/types";

const user = (username: string, displayName?: string): User => ({
  username,
  ...(displayName !== undefined && { displayName }),
  profileUrl: `https://www.instagram.com/${username}/`,
});

describe("UserSet", () => {
  it("keeps one entry per username", () => {
    const set = new UserSet();

    expect(set.add(user("alice"))).toBe(true);
    expect(set.add(user("alice"))).toBe(false);
    expect(set.size).toBe(1);
  });

  it("preserves first-seen order", () => {
    const set = new UserSet();
    set.addAll([user("carol"), user("alice"), user("bob"), user("alice")]);

    expect(set.toArray().map((u) => u.username)).toEqual(["carol", "alice", "bob"]);
  });

  it("keeps the first sighting when a duplicate differs", () => {
    const set = new UserSet();
    set.add(user("alice", "Alice"));
    set.add(user("alice", "Alice Renamed"));

    expect(set.toArray()).toEqual([user("alice", "Alice")]);
  });

  it("reports how many users a batch added", () => {
    const set = new UserSet();

    expect(set.addAll([user("alice"), user("bob")])).toBe(2);
    expect(set.addAll([user("bob"), user("carol")])).toBe(1);
    expect(set.addAll([user("alice"), user("carol")])).toBe(0);
    expect(set.size).toBe(3);
  });

  it("returns a copy, not a live view", () => {
    const set = new UserSet();
    set.add(user("alice"));
    const snapshot = set.toArray();
    set.add(user("bob"));

    expect(snapshot).toHaveLength(1);
  });
});
