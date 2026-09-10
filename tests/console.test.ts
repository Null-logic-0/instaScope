import { afterEach, describe, expect, it } from "vitest";
import { createConsoleApi } from "../src/console";
import { fakeDialog, usernames } from "./helpers/fake-list";
import { loadFixture } from "./helpers/fixture";
import { resetVisibility, setVisibility } from "./helpers/visibility";

afterEach(resetVisibility);

const timing = { settleMs: 5, loadTimeoutMs: 40, confirmTimeoutMs: 20 };

function profileWithGrowingFollowing(total: number, pageSize: number): void {
  loadFixture("profile-header.html");
  const all = usernames(total);
  document.querySelector('[data-test="following"]')!.addEventListener("click", () => {
    let loaded = pageSize;
    let loading = false;
    setTimeout(() => {
      fakeDialog({
        usernames: all.slice(0, pageSize),
        onScroll(top, list) {
          if (loading || loaded >= total || top < list.maxTop) return;
          loading = true;
          setTimeout(() => {
            list.appendRows(all.slice(loaded, loaded + pageSize));
            loaded += pageSize;
            if (loaded >= total) list.removeSpinner();
            loading = false;
          }, 10);
        },
      });
    }, 5);
  });
}

describe("console api", () => {
  it("runs a feature and logs a summary", async () => {
    profileWithGrowingFollowing(20, 10);
    const lines: string[] = [];
    const api = createConsoleApi({ log: (line) => lines.push(line) });

    const result = await api.collectFollowing({ timing });

    expect(result.users).toHaveLength(20);
    expect(lines.at(-1)).toMatch(/following: 20 users, reached the end of the list/);
  });

  it("logs progress at most once per interval", async () => {
    profileWithGrowingFollowing(60, 10);
    const lines: string[] = [];
    const api = createConsoleApi({ log: (line) => lines.push(line), progressIntervalMs: 30 });

    await api.collectFollowing({ timing });

    const progress = lines.filter((line) => line.includes("so far"));
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.length).toBeLessThan(20);
  });

  it("announces a pause when the tab is hidden and a resume when shown", async () => {
    profileWithGrowingFollowing(20, 10);
    const lines: string[] = [];
    const api = createConsoleApi({ log: (line) => lines.push(line) });
    setVisibility("hidden");

    const pending = api.collectFollowing({ timing });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lines).toEqual([expect.stringMatching(/paused, the tab is hidden/)]);

    setVisibility("visible");
    const result = await pending;

    expect(result.users).toHaveLength(20);
    expect(lines[1]).toMatch(/resumed/);
  });

  it("cancels the running collection", async () => {
    profileWithGrowingFollowing(200, 10);
    const api = createConsoleApi({ log: () => {} });

    const pending = api.collectFollowing({ timing, onProgress: ({ collected }) => collected >= 30 && api.cancel() });

    await expect(pending).resolves.toMatchObject({ stopReason: "cancelled" });
    expect(api.cancel()).toBe(false);
  });

  it("refuses to start a second collection while one is running", async () => {
    profileWithGrowingFollowing(30, 10);
    const api = createConsoleApi({ log: () => {} });

    const first = api.collectFollowing({ timing });
    await expect(api.collectFollowers({ timing })).rejects.toThrow(/already running/);
    await first;
  });
});
