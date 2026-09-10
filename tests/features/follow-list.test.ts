import { describe, expect, it } from "vitest";
import { collectFollowers, collectFollowing } from "../../src/features/follow-list";
import { fakeDialog, usernames } from "../helpers/fake-list";
import { loadFixture } from "../helpers/fixture";

const timing = { settleMs: 5, loadTimeoutMs: 40, confirmTimeoutMs: 20 };

function profileWhoseDialogShows(kind: "followers" | "following", names: string[]): void {
  loadFixture("profile-header.html");
  const other = kind === "followers" ? "following" : "followers";
  document.querySelector(`[data-test="${other}"]`)!.addEventListener("click", () => {
    throw new Error(`clicked the ${other} control`);
  });
  document.querySelector(`[data-test="${kind}"]`)!.addEventListener("click", () => {
    setTimeout(() => fakeDialog({ usernames: names, spinner: false }), 5);
  });
}

describe("collectFollowers", () => {
  it("opens the followers dialog and collects it", async () => {
    const names = usernames(4);
    profileWhoseDialogShows("followers", names);

    const result = await collectFollowers({ timing });

    expect(result.stopReason).toBe("end_of_list");
    expect(result.users.map((u) => u.username)).toEqual(names);
  });

  it("survives Instagram swapping the placeholder dialog for the real one", async () => {
    const names = usernames(4);
    loadFixture("profile-header.html");
    document.querySelector('[data-test="followers"]')!.addEventListener("click", () => {
      document.body.insertAdjacentHTML("beforeend", '<div role="dialog"><div role="progressbar"></div></div>');
      setTimeout(() => fakeDialog({ usernames: names, spinner: false }), 10);
    });

    const result = await collectFollowers({ timing });

    expect(result.users.map((u) => u.username)).toEqual(names);
  });

  it("fails clearly when the header has no followers control", async () => {
    document.body.innerHTML = "<header><section><h2>private</h2></section></header>";

    await expect(collectFollowers({ timing })).rejects.toThrow(/followers count/);
  });

  it("fails when the dialog never opens", async () => {
    loadFixture("profile-header.html");

    await expect(collectFollowers({ timing, openTimeoutMs: 20 })).rejects.toThrow(/Nothing happened/);
  });

  it("returns a cancelled result when aborted before the dialog opens", async () => {
    loadFixture("profile-header.html");
    const controller = new AbortController();
    const pending = collectFollowers({ timing, signal: controller.signal });
    controller.abort();

    await expect(pending).resolves.toMatchObject({ stopReason: "cancelled", users: [] });
  });
});

describe("collectFollowing", () => {
  it("opens the following dialog and collects it", async () => {
    const names = usernames(3);
    profileWhoseDialogShows("following", names);

    const result = await collectFollowing({ timing });

    expect(result.users.map((u) => u.username)).toEqual(names);
  });
});
