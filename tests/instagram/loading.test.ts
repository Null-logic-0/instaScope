import { describe, expect, it } from "vitest";
import { discoverList, findDialog } from "../../src/instagram/discovery";
import { hasLoadingIndicator } from "../../src/instagram/loading";
import { loadFixture } from "../helpers/fixture";

describe("hasLoadingIndicator", () => {
  it("sees the spinner below the following list", () => {
    loadFixture("dialog-following.html");

    expect(hasLoadingIndicator(discoverList(findDialog(document)!)!)).toBe(true);
  });

  it("reports no indicator once the spinner is removed", () => {
    loadFixture("dialog-following.html");
    document.querySelector('[data-test="spinner"]')!.remove();

    expect(hasLoadingIndicator(discoverList(findDialog(document)!)!)).toBe(false);
  });

  it("does not mistake the suggestions section for a spinner", () => {
    loadFixture("dialog-followers-suggestions.html");

    expect(hasLoadingIndicator(discoverList(findDialog(document)!)!)).toBe(false);
  });

  it("reports no indicator on a page list", () => {
    loadFixture("likes-page.html");

    expect(hasLoadingIndicator(discoverList(document.querySelector("main")!)!)).toBe(false);
  });
});
