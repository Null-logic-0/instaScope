import { describe, expect, it } from "vitest";
import { collect, CollectionError, type Progress } from "../src/collector";
import { fakeDialog, fakePage, usernames, type FakeList } from "./helpers/fake-list";

const timing = { settleMs: 5, loadTimeoutMs: 80, confirmTimeoutMs: 30 };

function growingList(total: number, pageSize: number, { latency = 10, loads = true } = {}) {
  const all = usernames(total);
  let loaded = pageSize;
  let loading = false;

  const fake = fakeDialog({
    usernames: all.slice(0, pageSize),
    onScroll(top, list) {
      if (!loads || loading || loaded >= total || top < list.maxTop) return;
      loading = true;
      setTimeout(() => {
        const next = all.slice(loaded, loaded + pageSize);
        loaded += next.length;
        list.appendRows(next);
        if (loaded >= total) list.removeSpinner();
        loading = false;
      }, latency);
    },
  });

  return { fake, all };
}

function windowedList(total: number, windowSize: number) {
  const all = usernames(total);
  const rowHeight = 60;
  const rowsAt = (top: number) => {
    const start = Math.max(0, Math.floor(top / rowHeight) - 2);
    return all.slice(start, start + windowSize);
  };

  const fake = fakeDialog({
    usernames: rowsAt(0),
    spinner: false,
    rowHeight,
    onScroll: (top, list) => list.replaceRows(rowsAt(top)),
  });
  fake.setScrollHeight(total * rowHeight);

  return { fake, all };
}

const names = (result: { users: { username: string }[] }) => result.users.map((u) => u.username);

describe("collect", () => {
  it("collects a list that grows as it is scrolled", async () => {
    const { fake, all } = growingList(30, 10);

    const result = await collect({ root: fake.root, timing });

    expect(result.stopReason).toBe("end_of_list");
    expect(names(result)).toEqual(all);
  });

  it("collects every row of a windowed list", async () => {
    const { fake, all } = windowedList(40, 8);

    const result = await collect({ root: fake.root, timing });

    expect(result.stopReason).toBe("end_of_list");
    expect(names(result)).toEqual(all);
    expect(fake.list.children.length).toBeLessThan(all.length);
  });

  it("collects a static page by scrolling the document", async () => {
    const all = usernames(25);
    const { root } = fakePage({ usernames: all });

    const result = await collect({ root, timing });

    expect(result.stopReason).toBe("end_of_list");
    expect(names(result)).toEqual(all);
  });

  it("never scrolls further than one viewport at a time", async () => {
    const { fake } = windowedList(40, 8);

    await collect({ root: fake.root, timing });

    const steps = fake.simulator.positions.map((top, i, all) => top - (all[i - 1] ?? 0));
    expect(Math.max(...steps)).toBeLessThanOrEqual(fake.container.clientHeight);
  });

  it("deduplicates users that reappear on a later page", async () => {
    const all = usernames(10);
    let loaded = false;
    const fake = fakeDialog({
      usernames: all.slice(0, 6),
      onScroll(top, list) {
        if (loaded || top < list.maxTop) return;
        loaded = true;
        setTimeout(() => {
          list.appendRows(all.slice(4));
          list.removeSpinner();
        }, 10);
      },
    });

    const result = await collect({ root: fake.root, timing });

    expect(names(result)).toEqual(all);
  });

  it("stops with target_reached and returns exactly the requested number", async () => {
    const { fake, all } = growingList(30, 10);

    const result = await collect({ root: fake.root, timing, maxUsers: 15 });

    expect(result.stopReason).toBe("target_reached");
    expect(names(result)).toEqual(all.slice(0, 15));
  });

  it("reports stalled when the loading indicator stays and nothing arrives", async () => {
    const { fake, all } = growingList(30, 10, { loads: false });
    const started = Date.now();

    const result = await collect({ root: fake.root, timing });

    expect(result.stopReason).toBe("stalled");
    expect(names(result)).toEqual(all.slice(0, 10));
    expect(Date.now() - started).toBeGreaterThanOrEqual(timing.loadTimeoutMs);
  });

  it("returns end_of_list for an empty list", async () => {
    const fake = fakeDialog({ usernames: [], spinner: false });

    const result = await collect({ root: fake.root, timing });

    expect(result).toMatchObject({ stopReason: "end_of_list", users: [] });
  });

  it("finishes despite unrelated mutations at the bottom", async () => {
    const fake = fakeDialog({ usernames: usernames(3), spinner: false });
    const noise = document.createElement("div");
    const interval = setInterval(() => (noise.isConnected ? noise.remove() : fake.container.append(noise)), 3);

    try {
      const result = await collect({ root: fake.root, timing });
      expect(result.stopReason).toBe("end_of_list");
      expect(result.users).toHaveLength(3);
    } finally {
      clearInterval(interval);
    }
  });

  it("returns partial results when cancelled", async () => {
    const { fake } = growingList(50, 10);
    const controller = new AbortController();
    const onProgress = ({ collected }: Progress) => {
      if (collected >= 20) controller.abort();
    };

    const result = await collect({ root: fake.root, timing, signal: controller.signal, onProgress });

    expect(result.stopReason).toBe("cancelled");
    expect(result.users.length).toBeGreaterThanOrEqual(20);
    expect(result.users.length).toBeLessThan(50);
  });

  it("returns cancelled immediately for an aborted signal", async () => {
    const { fake } = growingList(30, 10);
    const controller = new AbortController();
    controller.abort();

    const result = await collect({ root: fake.root, timing, signal: controller.signal });

    expect(result).toMatchObject({ stopReason: "cancelled", users: [] });
  });

  it("fails with the partial results when the list disappears", async () => {
    const { fake } = growingList(50, 10);
    const onProgress = ({ collected }: Progress) => {
      if (collected >= 20) fake.root.remove();
    };

    const failure = collect({ root: fake.root, timing, onProgress });

    await expect(failure).rejects.toBeInstanceOf(CollectionError);
    await failure.catch((error: CollectionError) => {
      expect(error.users.length).toBeGreaterThanOrEqual(20);
    });
  });

  it("reports progress with a growing count", async () => {
    const { fake } = growingList(30, 10);
    const counts: number[] = [];

    await collect({ root: fake.root, timing, onProgress: ({ collected }) => counts.push(collected) });

    expect(counts[0]).toBe(10);
    expect(counts.at(-1)).toBe(30);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });
});

describe("fake list helper", () => {
  it("clamps scrolling to the content height", () => {
    const fake: FakeList = fakeDialog({ usernames: usernames(10) });

    fake.container.scrollTop = 10_000;

    expect(fake.container.scrollTop).toBe(fake.maxTop);
  });
});
