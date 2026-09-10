import { describe, expect, it } from "vitest";

// Guards the DOM capabilities the collector will rely on. If happy-dom ever
// lacks one of these, this fails before any real test gives a misleading result.
describe("test DOM environment", () => {
  it("parses HTML and supports querySelectorAll", () => {
    document.body.innerHTML = `
      <div role="dialog">
        <a href="/alice/">alice</a>
        <a href="/bob/">bob</a>
      </div>`;

    const links = document.querySelectorAll<HTMLAnchorElement>('[role="dialog"] a');
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("/alice/");
  });

  it("exposes scroll geometry as writable numbers", () => {
    const el = document.createElement("div");
    document.body.append(el);

    expect(typeof el.scrollTop).toBe("number");
    expect(typeof el.scrollHeight).toBe("number");
    expect(typeof el.clientHeight).toBe("number");
    el.scrollTop = 100;
    expect(el.scrollTop).toBe(100);
  });

  it("computes overflow-y from inline and stylesheet rules", () => {
    document.body.innerHTML = `
      <style>.scroller { overflow-y: auto; }</style>
      <div id="inline" style="overflow-y: scroll"></div>
      <div id="styled" class="scroller"></div>
      <div id="plain"></div>`;

    expect(getComputedStyle(document.querySelector("#inline")!).overflowY).toBe("scroll");
    expect(getComputedStyle(document.querySelector("#styled")!).overflowY).toBe("auto");
    expect(getComputedStyle(document.querySelector("#plain")!).overflowY).not.toMatch(/auto|scroll/);
  });

  it("delivers MutationObserver callbacks asynchronously", async () => {
    const target = document.createElement("ul");
    document.body.append(target);

    const seen = new Promise<MutationRecord[]>((resolve) => {
      new MutationObserver((records, observer) => {
        observer.disconnect();
        resolve(records);
      }).observe(target, { childList: true });
    });

    target.append(document.createElement("li"));
    const records = await seen;

    expect(records[0]?.type).toBe("childList");
    expect(records[0]?.addedNodes).toHaveLength(1);
  });
});
