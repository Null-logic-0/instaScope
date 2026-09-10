import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard, downloadCsv, downloadJson } from "../../src/output/browser";
import type { User } from "../../src/types";

const alice: User = { username: "alice", displayName: "Alice", profileUrl: "https://www.instagram.com/alice/" };

function stubDownloads() {
  const clicks: { href: string; download: string }[] = [];
  const blobs: Blob[] = [];
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:instascope";
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ href: this.getAttribute("href") ?? "", download: this.download });
  });
  return { clicks, blobs };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadJson / downloadCsv", () => {
  it("clicks a temporary link pointing at a blob and removes it", () => {
    const { clicks } = stubDownloads();

    downloadJson([alice]);
    downloadCsv([alice], "followers.csv");

    expect(clicks).toEqual([
      { href: "blob:instascope", download: "instascope.json" },
      { href: "blob:instascope", download: "followers.csv" },
    ]);
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("prefixes CSV downloads with a UTF-8 byte order mark", async () => {
    const { blobs } = stubDownloads();

    downloadCsv([{ ...alice, displayName: "Bob Two 🐙" }]);

    const text = await blobs[0]!.text();
    expect(blobs[0]!.type).toBe("text/csv;charset=utf-8");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1).startsWith("username,display_name,profile_url\r\n")).toBe(true);
    expect(text).toContain("Bob Two 🐙");
  });
});

describe("copyToClipboard", () => {
  it("writes through the async clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyToClipboard("alice");

    expect(writeText).toHaveBeenCalledWith("alice");
  });
});
