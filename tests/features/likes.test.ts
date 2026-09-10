import { afterEach, describe, expect, it } from "vitest";
import { collectLikes } from "../../src/features/likes";
import { fakeDialog, fakePage, usernames } from "../helpers/fake-list";

const timing = { settleMs: 5, loadTimeoutMs: 40, confirmTimeoutMs: 20 };

function postPage(links = 1): void {
  document.body.innerHTML = `
    <main>
      <article>
        ${Array.from({ length: links }, (_, i) => `<a href="/p/post${i}/liked_by/">others</a>`).join("")}
        <a href="/author/">author</a>
      </article>
    </main>`;
}

afterEach(() => {
  history.replaceState(null, "", "/");
});

describe("collectLikes", () => {
  it("opens the likes dialog from a post and collects it", async () => {
    const names = usernames(5);
    postPage();
    document.querySelector('a[href$="/liked_by/"]')!.addEventListener("click", (event) => {
      event.preventDefault();
      setTimeout(() => fakeDialog({ usernames: names, spinner: false }), 5);
    });

    const result = await collectLikes({ timing });

    expect(result.users.map((u) => u.username)).toEqual(names);
  });

  it("collects the likes page directly when already on it", async () => {
    const names = usernames(6);
    fakePage({ usernames: names });
    history.replaceState(null, "", "/p/post0/liked_by/");

    const result = await collectLikes({ timing });

    expect(result.users.map((u) => u.username)).toEqual(names);
  });

  it("accepts several links to the same post's likes", async () => {
    const names = usernames(3);
    document.body.innerHTML = `
      <main><article>
        <a href="/p/post0/liked_by/"><img alt="liker"></a>
        <a href="/p/post0/liked_by/">others</a>
      </article></main>`;
    document.querySelector('a[href$="/liked_by/"]')!.addEventListener("click", (event) => {
      event.preventDefault();
      setTimeout(() => fakeDialog({ usernames: names, spinner: false }), 5);
    });

    const result = await collectLikes({ timing });

    expect(result.users.map((u) => u.username)).toEqual(names);
  });

  it("fails when no post is open", async () => {
    document.body.innerHTML = "<main><a href='/alice/'>alice</a></main>";

    await expect(collectLikes({ timing })).rejects.toThrow(/Open a post/);
  });

  it("fails when several posts are on screen", async () => {
    postPage(3);

    await expect(collectLikes({ timing })).rejects.toThrow(/single post/);
  });
});
