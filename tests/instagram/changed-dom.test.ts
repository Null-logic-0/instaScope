import { describe, expect, it } from "vitest";
import { discoverList, findDialog } from "../../src/instagram/discovery";
import { extractUsers } from "../../src/instagram/extraction";
import { hasLoadingIndicator } from "../../src/instagram/loading";
import { loadFixture } from "../helpers/fixture";

describe("a redesigned dialog that keeps only the profile links", () => {
  it("is still discovered: rows, list and scroll container", () => {
    loadFixture("dialog-changed.html");
    const found = discoverList(findDialog(document)!);

    expect(found?.list).toBe(document.querySelector('[data-test="list"]'));
    expect(found?.rows.map((row) => row.tagName)).toEqual(["LI", "LI", "LI"]);
    expect(found?.scrollContainer).toBe(document.querySelector('[data-test="scroll-container"]'));
    expect(hasLoadingIndicator(found!)).toBe(true);
  });

  it("still yields every username, while display names degrade to absent", () => {
    loadFixture("dialog-changed.html");
    const users = extractUsers(discoverList(findDialog(document)!)!.rows);

    expect(users.map((u) => u.username)).toEqual(["alice_1", "bob.two", "carol"]);
    expect(users.every((u) => u.profileUrl.startsWith("https://www.instagram.com/"))).toBe(true);
    expect(users.map((u) => u.displayName)).toEqual([undefined, undefined, undefined]);
  });
});
