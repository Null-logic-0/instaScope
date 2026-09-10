import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard, downloadCsv, downloadJson } from "../../src/output/browser";
import type { User } from "../../src/types";

const alice: User = { username: "alice", displayName: "Alice", profileUrl: "https://www.instagram.com/alice/" };

function stubDownloads() {
  const clicks: { href: string; download: string }[] = [];
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:instascope"),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ href: this.getAttribute("href") ?? "", download: this.download });
  });
  return clicks;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadJson / downloadCsv", () => {
  it("clicks a temporary link pointing at a blob and removes it", () => {
    const clicks = stubDownloads();

    downloadJson([alice]);
    downloadCsv([alice], "followers.csv");

    expect(clicks).toEqual([
      { href: "blob:instascope", download: "instascope.json" },
      { href: "blob:instascope", download: "followers.csv" },
    ]);
    expect(document.querySelectorAll("a")).toHaveLength(0);
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
