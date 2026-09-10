import { describe, expect, it } from "vitest";
import { readScrollPosition, scrollForward } from "../../src/core/scrolling";
import { defineGeometry } from "../helpers/fixture";
import { simulateScrolling } from "../helpers/scroll-simulator";

function scroller(scrollHeight: number, clientHeight: number): HTMLElement {
  const element = document.createElement("div");
  element.dataset["scrollHeight"] = String(scrollHeight);
  element.dataset["clientHeight"] = String(clientHeight);
  defineGeometry(element);
  simulateScrolling(element);
  document.body.append(element);
  return element;
}

describe("readScrollPosition", () => {
  it("reports the geometry and whether the end is visible", () => {
    const element = scroller(796, 309);

    expect(readScrollPosition(element)).toEqual({ top: 0, height: 796, viewport: 309, atBottom: false });
    element.scrollTop = 487;
    expect(readScrollPosition(element).atBottom).toBe(true);
  });

  it("tolerates fractional scroll positions", () => {
    const element = scroller(796, 309);
    element.scrollTop = 486.4;

    expect(readScrollPosition(element).atBottom).toBe(true);
  });

  it("treats content that fits as already at the bottom", () => {
    expect(readScrollPosition(scroller(240, 309)).atBottom).toBe(true);
  });
});

describe("scrollForward", () => {
  it("advances by one viewport at a time and stops at the end", () => {
    const element = scroller(796, 309);

    expect(scrollForward(element).top).toBe(309);
    expect(scrollForward(element)).toMatchObject({ top: 487, atBottom: true });
    expect(scrollForward(element)).toMatchObject({ top: 487, atBottom: true });
  });

  it("keeps a container that does not overflow at zero", () => {
    const element = scroller(240, 309);

    expect(scrollForward(element)).toMatchObject({ top: 0, atBottom: true });
  });
});
