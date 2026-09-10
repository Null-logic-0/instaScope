import { afterEach, describe, expect, it } from "vitest";
import { waitUntilVisible } from "../../src/core/visibility";
import { resetVisibility, setVisibility } from "../helpers/visibility";

afterEach(resetVisibility);

describe("waitUntilVisible", () => {
  it("resolves immediately when the document is visible", async () => {
    await expect(waitUntilVisible(document)).resolves.toBe("visible");
  });

  it("waits for the document to become visible", async () => {
    setVisibility("hidden");
    let settled = false;
    const pending = waitUntilVisible(document).then((outcome) => {
      settled = true;
      return outcome;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    setVisibility("visible");
    await expect(pending).resolves.toBe("visible");
  });

  it("resolves aborted when cancelled while hidden", async () => {
    setVisibility("hidden");
    const controller = new AbortController();
    const pending = waitUntilVisible(document, controller.signal);

    controller.abort();
    await expect(pending).resolves.toBe("aborted");
  });
});
