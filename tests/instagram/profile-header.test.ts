import { describe, expect, it } from "vitest";
import { findProfileStats } from "../../src/instagram/profile-header";
import { loadFixture } from "../helpers/fixture";

describe("findProfileStats", () => {
  it("returns the followers and following controls from the stats row", () => {
    loadFixture("profile-header.html");

    const stats = findProfileStats(document);

    expect(stats?.followers).toBe(document.querySelector('[data-test="followers"]'));
    expect(stats?.following).toBe(document.querySelector('[data-test="following"]'));
  });

  it("works when the profile has no posts", () => {
    loadFixture("profile-header.html");
    document.querySelector('[data-test="followers"]')!.parentElement!.previousElementSibling!.innerHTML =
      '<span dir="auto"><span><span>0</span></span> posts</span>';

    expect(findProfileStats(document)?.followers).toBe(document.querySelector('[data-test="followers"]'));
  });

  it("does not depend on the language of the labels", () => {
    loadFixture("profile-header.html");
    for (const span of document.querySelectorAll('header span[dir="auto"]')) {
      span.lastChild!.textContent = " მიმდევარი";
    }

    expect(findProfileStats(document)).not.toBeNull();
  });

  it("returns null when the counts are not links", () => {
    loadFixture("profile-header.html");
    for (const link of document.querySelectorAll('header a[href="#"][data-test]')) {
      link.replaceWith(...link.childNodes);
    }

    expect(findProfileStats(document)).toBeNull();
  });

  it("returns null without a header", () => {
    document.body.innerHTML = "<main></main>";

    expect(findProfileStats(document)).toBeNull();
  });
});
