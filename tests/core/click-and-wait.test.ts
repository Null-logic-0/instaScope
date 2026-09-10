import { describe, expect, it } from "vitest";
import { clickAndWaitFor } from "../../src/core/click-and-wait";

function button(): HTMLButtonElement {
  document.body.innerHTML = "<button>open</button>";
  return document.querySelector("button")!;
}

describe("clickAndWaitFor", () => {
  it("clicks the control and resolves once the condition holds", async () => {
    const control = button();
    control.addEventListener("click", () => {
      setTimeout(() => document.body.insertAdjacentHTML("beforeend", '<div role="dialog"></div>'), 5);
    });

    const dialog = await clickAndWaitFor(control, {
      timeoutMs: 500,
      until: (doc) => doc.querySelector('[role="dialog"]'),
    });

    expect(dialog?.getAttribute("role")).toBe("dialog");
  });

  it("resolves immediately when the condition already holds after the click", async () => {
    const control = button();
    control.addEventListener("click", () => control.setAttribute("aria-expanded", "true"));

    const result = await clickAndWaitFor(control, {
      timeoutMs: 500,
      until: (doc) => doc.querySelector('[aria-expanded="true"]'),
    });

    expect(result).toBe(control);
  });

  it("rejects when nothing happens before the timeout", async () => {
    await expect(
      clickAndWaitFor(button(), { timeoutMs: 20, until: (doc) => doc.querySelector('[role="dialog"]') }),
    ).rejects.toThrow("Nothing happened");
  });

  it("returns null when aborted while waiting", async () => {
    const controller = new AbortController();
    const pending = clickAndWaitFor(button(), {
      timeoutMs: 500,
      signal: controller.signal,
      until: (doc) => doc.querySelector('[role="dialog"]'),
    });

    controller.abort();
    await expect(pending).resolves.toBeNull();
  });
});
