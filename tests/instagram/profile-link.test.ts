import { describe, expect, it } from "vitest";
import { parseProfileHref, profileUrl } from "../../src/instagram/profile-link";

describe("parseProfileHref", () => {
  it.each([
    ["/alice/", "alice"],
    ["/Alice.B_1/", "alice.b_1"],
    ["/bob", "bob"],
    ["/bob/?hl=en", "bob"],
    ["/bob/#top", "bob"],
    ["https://www.instagram.com/bob/", "bob"],
    ["https://instagram.com/bob", "bob"],
  ])("accepts %s as %s", (href, username) => {
    expect(parseProfileHref(href)).toBe(username);
  });

  it.each([
    ["#"],
    ["/"],
    [""],
    ["/explore/"],
    ["/reels/"],
    ["/p/DcvQUcREWXx/"],
    ["/accounts/edit/"],
    ["/legal/privacy/"],
    ["/alice/followers/"],
    ["https://example.com/alice/"],
    ["javascript:alert(1)"],
    ["/a b/"],
    ["/al!ce/"],
    [`/${"a".repeat(31)}/`],
  ])("rejects %s", (href) => {
    expect(parseProfileHref(href)).toBeNull();
  });

  it("rejects missing hrefs", () => {
    expect(parseProfileHref(null)).toBeNull();
    expect(parseProfileHref(undefined)).toBeNull();
  });
});

describe("profileUrl", () => {
  it("builds the canonical profile URL", () => {
    expect(profileUrl("alice")).toBe("https://www.instagram.com/alice/");
  });
});
