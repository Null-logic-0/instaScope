import { describe, expect, it } from "vitest";
import { discoverList, findDialog } from "../../src/instagram/discovery";
import { extractUser, extractUsers } from "../../src/instagram/extraction";
import { loadFixture } from "../helpers/fixture";

function rowsOf(root: Element): Element[] {
  return discoverList(root)?.rows ?? [];
}

describe("extractUsers", () => {
  it("reads username, display name and profile URL from following rows", () => {
    loadFixture("dialog-following.html");

    expect(extractUsers(rowsOf(findDialog(document)!))).toEqual([
      { username: "alice_1", displayName: "Alice One", profileUrl: "https://www.instagram.com/alice_1/" },
      { username: "bob.two", displayName: "Bob Two 🐙", profileUrl: "https://www.instagram.com/bob.two/" },
      { username: "carol", profileUrl: "https://www.instagram.com/carol/" },
    ]);
  });

  it("does not let the follow button or separator leak into the display name", () => {
    loadFixture("dialog-followers-suggestions.html");

    expect(extractUsers(rowsOf(findDialog(document)!))).toEqual([
      { username: "dana", displayName: "Dana D.", profileUrl: "https://www.instagram.com/dana/" },
      { username: "erin_e", displayName: "Erin", profileUrl: "https://www.instagram.com/erin_e/" },
    ]);
  });

  it("reads rows on the likes page", () => {
    loadFixture("likes-page.html");

    expect(extractUsers(rowsOf(document.querySelector("main")!)).map((u) => u.username)).toEqual([
      "frank",
      "gina.g",
      "hank_h",
    ]);
  });
});

describe("extractUser", () => {
  it("takes the username from the href, not the anchor text", () => {
    document.body.innerHTML = `
      <div><a href="/Alice_1/" role="link"><span dir="auto">alice_1</span><svg><title>Verified</title></svg></a></div>`;

    expect(extractUser(document.body.firstElementChild!)?.username).toBe("alice_1");
  });

  it("returns null for a row without a profile link", () => {
    document.body.innerHTML = `<div><a href="/explore/">Explore</a><span dir="auto">Nobody</span></div>`;

    expect(extractUser(document.body.firstElementChild!)).toBeNull();
  });

  it("uses the row's own account when a second account is mentioned", () => {
    document.body.innerHTML = `
      <div>
        <a href="/bob/"><span dir="auto">bob</span></a>
        <span dir="auto"><span>Bob</span></span>
        <span dir="auto">Followed by <a href="/carol/">carol</a></span>
      </div>`;

    expect(extractUser(document.body.firstElementChild!)).toEqual({
      username: "bob",
      displayName: "Bob",
      profileUrl: "https://www.instagram.com/bob/",
    });
  });

  it("omits the display name when the span is empty", () => {
    document.body.innerHTML = `
      <div><a href="/bob/"><span dir="auto">bob</span></a><span dir="auto"><span>   </span></span></div>`;

    expect(extractUser(document.body.firstElementChild!)).toEqual({
      username: "bob",
      profileUrl: "https://www.instagram.com/bob/",
    });
  });

  it("trims whitespace around the display name", () => {
    document.body.innerHTML = `
      <div><a href="/bob/"><span dir="auto">bob</span></a><span dir="auto">
        Bob Two
      </span></div>`;

    expect(extractUser(document.body.firstElementChild!)?.displayName).toBe("Bob Two");
  });
});
