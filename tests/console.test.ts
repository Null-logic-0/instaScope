import { afterEach, describe, expect, it, vi } from "vitest";
import { createConsoleApi, subjectFor } from "../src/console";
import type { StorageBackend } from "../src/store/store";
import { fakeDialog, usernames } from "./helpers/fake-list";
import { loadFixture } from "./helpers/fixture";
import { resetVisibility, setVisibility } from "./helpers/visibility";

const timing = { settleMs: 5, loadTimeoutMs: 40, confirmTimeoutMs: 20 };

function memoryBackend(): StorageBackend {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

function api(log: (line: string) => void = () => {}, progressIntervalMs = 2000) {
  return createConsoleApi({ log, progressIntervalMs, storage: memoryBackend() });
}

function profileWhoseListShows(kind: "followers" | "following", names: string[], pageSize = names.length): void {
  loadFixture("profile-header.html");
  const total = names.length;
  document.querySelector(`[data-test="${kind}"]`)!.addEventListener("click", () => {
    let loaded = pageSize;
    let loading = false;
    setTimeout(() => {
      fakeDialog({
        usernames: names.slice(0, pageSize),
        spinner: pageSize < total,
        onScroll(top, list) {
          if (loading || loaded >= total || top < list.maxTop) return;
          loading = true;
          setTimeout(() => {
            list.appendRows(names.slice(loaded, loaded + pageSize));
            loaded += pageSize;
            if (loaded >= total) list.removeSpinner();
            loading = false;
          }, 10);
        },
      });
    }, 5);
  });
}

afterEach(() => {
  resetVisibility();
  history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("console api: collecting", () => {
  it("runs a feature and logs a summary", async () => {
    profileWhoseListShows("following", usernames(20), 10);
    const lines: string[] = [];

    const result = await api((line) => lines.push(line)).collectFollowing({ timing });

    expect(result.users).toHaveLength(20);
    expect(lines).toContainEqual(expect.stringMatching(/following: 20 users, reached the end of the list/));
  });

  it("logs progress at most once per interval", async () => {
    profileWhoseListShows("following", usernames(60), 10);
    const lines: string[] = [];

    await api((line) => lines.push(line), 30).collectFollowing({ timing });

    const progress = lines.filter((line) => line.includes("so far"));
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.length).toBeLessThan(20);
  });

  it("announces a pause when the tab is hidden and a resume when shown", async () => {
    profileWhoseListShows("following", usernames(20), 10);
    const lines: string[] = [];
    const console = api((line) => lines.push(line));
    setVisibility("hidden");

    const pending = console.collectFollowing({ timing });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lines).toEqual([expect.stringMatching(/paused, the tab is hidden/)]);

    setVisibility("visible");
    const result = await pending;

    expect(result.users).toHaveLength(20);
    expect(lines[1]).toMatch(/resumed/);
  });

  it("cancels the running collection", async () => {
    profileWhoseListShows("following", usernames(200), 10);
    const console = api();

    const pending = console.collectFollowing({ timing, onProgress: ({ collected }) => collected >= 30 && console.cancel() });

    await expect(pending).resolves.toMatchObject({ stopReason: "cancelled" });
    expect(console.cancel()).toBe(false);
  });

  it("refuses to start a second collection while one is running", async () => {
    profileWhoseListShows("following", usernames(30), 10);
    const console = api();

    const first = console.collectFollowing({ timing });
    await expect(console.collectFollowers({ timing })).rejects.toThrow(/already running/);
    await first;
  });
});

describe("console api: storing", () => {
  it("saves a complete collection as a snapshot of the profile in the URL", async () => {
    profileWhoseListShows("followers", usernames(3));
    history.replaceState(null, "", "/Me_Myself/");
    const lines: string[] = [];
    const console = api((line) => lines.push(line));

    await console.collectFollowers({ timing });

    expect(console.subjects()).toEqual(["me_myself"]);
    expect(console.store.latest("me_myself", "followers")?.usernames).toEqual(usernames(3));
    expect(lines.at(-1)).toMatch(/snapshot of me_myself saved \(1 in history\)/);
  });

  it("does not save a partial collection", async () => {
    profileWhoseListShows("followers", usernames(200), 10);
    const lines: string[] = [];
    const console = api((line) => lines.push(line));

    await console.collectFollowers({ timing, onProgress: ({ collected }) => collected >= 30 && console.cancel() });

    expect(console.subjects()).toEqual([]);
    expect(lines.at(-1)).toMatch(/partial result, not saved/);
  });

  it("refuses dataset operations before anything was collected", () => {
    const console = api();

    expect(() => console.stats()).toThrow(/Nothing collected yet/);
    expect(() => console.exportCsv("followers")).toThrow(/Nothing collected yet/);
  });
});

describe("console api: exporting", () => {
  function stubDownloads() {
    const downloads: { name: string; blob: Blob }[] = [];
    let pending: Blob | null = null;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => {
        pending = blob;
        return "blob:instascope";
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ name: this.download, blob: pending! });
    });
    return downloads;
  }

  async function collectedAccount() {
    const console = api();
    profileWhoseListShows("followers", ["ann", "ben"]);
    history.replaceState(null, "", "/me/");
    await console.collectFollowers({ timing });
    profileWhoseListShows("following", ["ben", "cat"]);
    await console.collectFollowing({ timing });
    return console;
  }

  it("exports datasets as CSV with sensible filenames", async () => {
    const console = await collectedAccount();
    const downloads = stubDownloads();

    console.downloadCsv("not-following-back");
    console.downloadCsv();

    expect(downloads.map((d) => d.name)).toEqual(["not-following-back.csv", `snapshot-${new Date().toISOString().slice(0, 10)}.csv`]);
    const text = await downloads[0]!.blob.text();
    expect(text.slice(1)).toMatch(/^username,display_name,profile_url,relationship,first_seen,last_seen\r\ncat,Name of cat,https:\/\/www\.instagram\.com\/cat\/,following,/);
  });

  it("still downloads an ad-hoc users array", async () => {
    const console = api();
    const downloads = stubDownloads();

    console.downloadCsv([{ username: "zed", profileUrl: "https://www.instagram.com/zed/" }]);

    expect(downloads[0]?.name).toBe("instascope.csv");
    expect(await downloads[0]!.blob.text()).toContain("zed,,https://www.instagram.com/zed/");
  });

  it("reports statistics from the stored snapshots", async () => {
    const console = await collectedAccount();
    const lines: string[] = [];
    const logging = createConsoleApi({ log: (line) => lines.push(line), storage: memoryBackend() });
    logging.importJson(console.store.exportJson());

    const stats = logging.stats();

    expect(stats).toMatchObject({ subject: "me", followers: 2, following: 2, mutuals: 1, notFollowingBack: 1, fans: 1 });
    expect(lines.at(-1)).toMatch(/me: followers 2 .* mutuals 1, not following back 1, fans 1/);
  });

  it("backs up and restores the whole store as JSON", async () => {
    const source = await collectedAccount();
    const downloads = stubDownloads();
    source.downloadJson();
    const backup = await downloads[0]!.blob.text();
    const target = api();

    const imported = await target.importJson(new File([backup], "backup.json"));

    expect(downloads[0]?.name).toMatch(/^instascope-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(imported).toEqual({ profiles: 3, snapshots: 2 });
    expect(target.dataset("mutuals").map((row) => row.username)).toEqual(["ben"]);
  });
});

describe("subjectFor", () => {
  it.each([
    ["followers", "/mosiashvilisalii/", "mosiashvilisalii"],
    ["following", "/Some.User/followers/", "some.user"],
    ["followers", "/", "unknown"],
    ["likes", "/p/DcvQUcREWXx/", "p/DcvQUcREWXx"],
    ["likes", "/reel/AbC123/liked_by/", "reel/AbC123"],
    ["likes", "/explore/", "unknown"],
  ] as const)("%s on %s → %s", (kind, pathname, subject) => {
    expect(subjectFor(kind, pathname)).toBe(subject);
  });
});
