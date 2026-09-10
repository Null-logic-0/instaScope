import { describe, expect, it } from "vitest";
import { waitForChange } from "../../src/core/wait-for-change";

function target(): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = "<div><span>row</span></div>";
  document.body.append(element);
  return element;
}

describe("waitForChange", () => {
  it("resolves when a node is added anywhere in the subtree", async () => {
    const element = target();
    const outcome = waitForChange(element, { timeoutMs: 1000 });

    element.firstElementChild!.append(document.createElement("span"));
    await expect(outcome).resolves.toBe("changed");
  });

  it("resolves when a node is removed", async () => {
    const element = target();
    const outcome = waitForChange(element, { timeoutMs: 1000 });

    element.firstElementChild!.remove();
    await expect(outcome).resolves.toBe("changed");
  });

  it("ignores attribute changes", async () => {
    const element = target();
    const outcome = waitForChange(element, { timeoutMs: 20 });

    element.firstElementChild!.setAttribute("class", "x1abc");
    await expect(outcome).resolves.toBe("timeout");
  });

  it("times out when nothing happens", async () => {
    await expect(waitForChange(target(), { timeoutMs: 10 })).resolves.toBe("timeout");
  });

  it("resolves immediately for an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(waitForChange(target(), { timeoutMs: 1000, signal: controller.signal })).resolves.toBe(
      "aborted",
    );
  });

  it("resolves when aborted while waiting", async () => {
    const controller = new AbortController();
    const outcome = waitForChange(target(), { timeoutMs: 1000, signal: controller.signal });

    controller.abort();
    await expect(outcome).resolves.toBe("aborted");
  });

  it("stops observing after resolving", async () => {
    const element = target();
    let calls = 0;
    const original = MutationObserver.prototype.disconnect;
    MutationObserver.prototype.disconnect = function () {
      calls += 1;
      return original.call(this);
    };
    try {
      await waitForChange(element, { timeoutMs: 5 });
    } finally {
      MutationObserver.prototype.disconnect = original;
    }

    expect(calls).toBe(1);
  });
});
