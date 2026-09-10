import { describe, expect, it } from "vitest";
import {
  discoverList,
  findDialog,
  findScrollContainer,
  profileAnchors,
} from "../../src/instagram/discovery";
import { loadFixture } from "../helpers/fixture";

const byTest = (name: string) => document.querySelector(`[data-test="${name}"]`);

describe("findDialog", () => {
  it("returns the open dialog", () => {
    loadFixture("dialog-following.html");
    expect(findDialog(document)?.getAttribute("aria-modal")).toBe("true");
  });

  it("returns the topmost dialog when several are stacked", () => {
    document.body.innerHTML = `
      <div role="dialog" id="post"></div>
      <div role="dialog" id="likes"></div>`;
    expect(findDialog(document)?.id).toBe("likes");
  });

  it("returns null when no dialog is open", () => {
    loadFixture("likes-page.html");
    expect(findDialog(document)).toBeNull();
  });
});

describe("discoverList", () => {
  it("finds the list, its rows and the scroll container in the following dialog", () => {
    loadFixture("dialog-following.html");
    const found = discoverList(findDialog(document)!);

    expect(found?.list).toBe(byTest("list"));
    expect(found?.rows).toHaveLength(3);
    expect(found?.rows.every((row) => row.parentElement === found.list)).toBe(true);
    expect(found?.scrollContainer).toBe(byTest("scroll-container"));
  });

  it("ignores profile links outside the root", () => {
    loadFixture("dialog-following.html");
    const dialog = findDialog(document)!;

    expect(profileAnchors(document.body).length).toBeGreaterThan(profileAnchors(dialog).length);
    expect(discoverList(dialog)?.rows).toHaveLength(3);
  });

  it("excludes the followers dialog's suggestions section", () => {
    loadFixture("dialog-followers-suggestions.html");
    const found = discoverList(findDialog(document)!);

    expect(found?.list).toBe(byTest("list"));
    expect(found?.rows).toHaveLength(2);
    expect(found?.scrollContainer).toBe(byTest("scroll-container"));
    expect(byTest("suggestions")?.contains(found!.rows[0]!)).toBe(false);
  });

  it("finds a list rendered on a page and scrolls the document", () => {
    loadFixture("likes-page.html");
    const found = discoverList(document.querySelector("main")!);

    expect(found?.list).toBe(byTest("list"));
    expect(found?.rows).toHaveLength(3);
    expect(found?.scrollContainer).toBe(document.scrollingElement);
  });

  it("returns null when the dialog has no rows", () => {
    loadFixture("dialog-empty.html");
    expect(discoverList(findDialog(document)!)).toBeNull();
  });

  it("returns null when the only links are app routes", () => {
    document.body.innerHTML = `
      <div role="dialog">
        <a href="/explore/">Explore</a>
        <a href="#">Close</a>
        <a href="/p/DcvQUcREWXx/">Post</a>
      </div>`;
    expect(discoverList(findDialog(document)!)).toBeNull();
  });

  it("skips list children without a profile link", () => {
    document.body.innerHTML = `
      <div role="dialog">
        <div>
          <div><a href="/alice/">alice</a></div>
          <div>separator</div>
          <div><a href="/bob/">bob</a></div>
        </div>
      </div>`;
    const found = discoverList(findDialog(document)!);

    expect(found?.rows).toHaveLength(2);
    expect(found?.rows.map((row) => row.textContent)).toEqual(["alice", "bob"]);
  });

  it("keeps a row that mentions a second account inside the same list", () => {
    document.body.innerHTML = `
      <div role="dialog">
        <div>
          <div><a href="/alice/">alice</a></div>
          <div><a href="/bob/">bob</a> <span>Followed by <a href="/carol/">carol</a></span></div>
          <div><a href="/dave/">dave</a></div>
        </div>
      </div>`;
    const found = discoverList(findDialog(document)!);

    expect(found?.rows).toHaveLength(3);
  });

  it("treats the root as the list when rows are its direct children", () => {
    document.body.innerHTML = `
      <div role="dialog">
        <div><a href="/alice/">alice</a></div>
        <div><a href="/bob/">bob</a></div>
      </div>`;
    const dialog = findDialog(document)!;
    const found = discoverList(dialog);

    expect(found?.list).toBe(dialog);
    expect(found?.rows).toHaveLength(2);
  });
});

describe("findScrollContainer", () => {
  it("skips scrollable-by-style ancestors that do not overflow", () => {
    loadFixture("dialog-following.html");
    const list = byTest("list")!;

    expect(getComputedStyle(list.parentElement!).overflowY).toBe("auto");
    expect(findScrollContainer(list)).toBe(byTest("scroll-container"));
  });

  it("falls back to the nearest scrollable-by-style ancestor when nothing overflows yet", () => {
    loadFixture("dialog-empty.html");
    const list = byTest("list")!;

    expect(findScrollContainer(list)).toBe(list.parentElement);
  });

  it("falls back to the document when no ancestor is scrollable", () => {
    loadFixture("likes-page.html");
    expect(findScrollContainer(byTest("list")!)).toBe(document.scrollingElement);
  });

  it("picks the container again once it starts to overflow", () => {
    loadFixture("dialog-empty.html");
    const container = byTest("scroll-container") as HTMLElement;
    const list = byTest("list")!;

    container.dataset["scrollHeight"] = "796";
    expect(findScrollContainer(list)).toBe(container);
  });
});
