# Observed Instagram DOM

Everything the collector assumes about Instagram's markup, with the evidence
behind each assumption. When Instagram changes and something breaks, start here.

- Observed: 2026-09-10, Chrome, desktop layout (~1570 px viewport), English UI,
  logged-in session, read-only inspection from the console.
- All class names are hashed (`x78zum5 xdj266r …`) and were ignored entirely.

## Followers / Following dialog

Opened by clicking the count in the profile header. The counts are
`a[href="#"][role="link"]`, not real links; the URL does not change.

| Part | Observed | Used by the collector? |
|---|---|---|
| Dialog | Exactly one `div[role="dialog"][aria-modal="true"]`, ~8 anonymous `div`s below `body` | Yes (`[role="dialog"]`) |
| Title | `div[role="heading"]` — "Followers" / "Following" | No — localised |
| Scroll container | The `overflow-y: auto` element ~5 levels under the dialog (`clientHeight` 309 here) | Yes — found *from the rows*, see below |
| Rows | Anonymous `div`s, siblings under one parent inside the first child of the scroll container | Yes |
| Username | `a[href="/<username>/"][role="link"]` containing `span[dir="auto"]` | Yes — the only stable per-row landmark |
| Display name | `span[dir="auto"] > span`, sibling of the username block, outside any `a`/`button`; sometimes absent; may be emoji/unicode | Yes |
| Verified badge | `svg[aria-label="Verified"]` inside the username anchor | Avoided — it adds "Verified" to `a.textContent`, so the username is read from `href`, never from anchor text |
| Avatar | `a[href]` when the account has no story, `span[role="link"]` when it has one (wrapped in `div[role="button"]` + `canvas`) | No — inconsistent |
| Buttons | "Follow" / "Following" / "Remove" | No — localised |
| Spinner | `svg[aria-label="Loading..."]` inside the scroll container's last child | Hint only — localised |

Row anatomy with classes, styles and image sources removed (Following dialog, verified account with a story):

```html
<div>                                     <!-- row -->
  <div><div><div><div><div><div><span><div>
    <div role="button" tabindex="0">        <!-- avatar / story ring -->
      <canvas height="55" width="55"></canvas>
      <span role="link" tabindex="-1"><img alt="<username>'s profile picture"></span>
    </div>
  </div></span></div></div></div>
  <div><div><div><div><div><span><div>
    <a href="/<username>/" role="link" tabindex="0">
      <div><div><span dir="auto"><username></span><div><svg aria-label="Verified"/></div></div></div>
    </a>
  </div></span></div></div>
  <span dir="auto"><span><Display Name></span></span>
  </div></div></div>
  <div><div><button type="button"><div><div dir="auto">Following</div></div></button></div></div>
  </div></div></div></div>
</div>
```

### Opening sequence (cold)

Measured with a `MutationObserver` on `body` after clicking the count control:

| t | What happens |
|---|---|
| ~30 ms | A **placeholder** `div[role="dialog"]` appears: a progress bar, no heading, no rows |
| ~60 ms | The placeholder is **removed** and a different `div[role="dialog"]` is mounted (heading, search box, progress bar) |
| ~850 ms | The first 12 rows are appended inside the second dialog |

On a warm open (same list opened again in the session) rows are present within ~60 ms.
Any code that captures "the dialog" at the moment one appears holds a node that is
about to be detached; the collector therefore re-resolves the topmost dialog every
round and observes `body`, not the dialog, while no rows exist.

### Scroll container children

- Following (60 accounts): `[list, spinnerWrapper]` while loading → `[list]` when exhausted.
- Followers (4 accounts): `[list, "Suggested for you" heading, suggestionsList, "See All Suggestions"]`.
  The suggestions list held **30 accounts / 60 profile anchors** with exactly the same
  row markup. Collecting every profile link in the dialog would report 34 followers
  for a 4-follower account.

### Pagination behaviour (Following, 60 accounts)

- 12 accounts per fetch; ~60 px per row.
- Setting `scrollTop = scrollHeight` on the scroll container triggers the next fetch.
  New rows appeared 1.5–3 s later.
- `scrollTop` does **not** follow content growth: after rows are appended the container
  is no longer at the bottom, so every round must scroll again.
- Rows are not virtualised: the first row survives scrolling and all 60 were present at the end.
- End of list: the spinner wrapper is removed from the scroll container and the count plateaus.
- Two requests per page (`/api/v1/friendships/show_many/` plus the page fetch). Not used.

## Likes

Two different surfaces, same row markup as the dialogs:

**Likes page** — reached by clicking "others" in the feed, URL `/p/<shortcode>/liked_by/`.
Rows live under `main`, scrolling is document-level (`document.scrollingElement`).
100 rows were present at load; scrolling to the bottom produced no requests and no spinner.

**Likes dialog** — reached from a post opened as a modal (two `[role="dialog"]`s stacked;
the likes one is last in document order, heading "Likes"). This list is **virtualised**:

- The scroll container was 6 510 px tall (≈107 rows at 60 px) but held only **11 rows**
  at any time (`ch` 356 px, so roughly the visible window plus a little slack).
- Scrolling to the bottom kept 11 rows but they were *different accounts* — the window
  slides; nodes for off-screen rows are removed.
- No spinner, no growth: a post with 2.6 M likes exposed exactly 100 likers (verified by
  collecting the whole window). Both surfaces cap the list at 100; the full liker list
  is not available in the web UI.

Consequence: DOM row count is meaningless as a progress measure for likes; only the
accumulated set of unique usernames is. Scroll steps must be smaller than the window
(`clientHeight`) or rows are skipped without ever entering the DOM.

## Feed

Not a collection target, but worth knowing: the home feed is virtualised too (rows were
recycled while scrolling). Any "count the rows" logic that happens to work on followers
must not be assumed to generalise.

## Hidden-tab caveat

When the document is hidden — background tab, or a fully occluded window on macOS —
Chrome skips its "update the rendering" step. Both `scroll` events and
`IntersectionObserver` callbacks are delivered from that step, so Instagram never
loads the next page even though `scrollTop` changes, and a windowed list stops
re-rendering. In a hidden tab a stall is **not** an end of list, and a windowed list
looks exhausted after ten rows. The collector therefore pauses whenever
`document.visibilityState` is `hidden` and resumes on `visibilitychange`, resetting
its patience clocks so hidden time never counts as "no growth".

## Design implications

1. Discover rows first, then derive containers from them: a row is the highest
   ancestor of a profile link that still contains exactly one profile link; the list
   is the row's parent; the scroll container is the nearest ancestor with
   `overflow-y: auto|scroll`. Do not find the container by "is currently scrollable" —
   a short list is not.
2. Only rows in the **first** row-bearing section of the scroll container belong to
   the collection. Suggestions are a different direct child.
3. Identity is the username derived from `href`, lower-cased. Anchor text is unreliable.
4. Progress is growth in the accumulated set of unique usernames, never DOM row count
   (likes are windowed). End of list is "no growth after N rounds with the container
   scrolled to the bottom"; spinner absence is only a fast-path hint.
5. Scroll in steps no larger than the container's `clientHeight`, so a windowed list
   renders every row at least once. For growing lists this costs a few extra rounds and
   nothing else.

## Summary of list shapes

| Surface | Container | Rows in DOM | Loads more on scroll | Cap |
|---|---|---|---|---|
| Followers dialog | dialog, `overflow-y: auto` | all loaded so far (+ suggestions section) | yes, 12 per fetch | none seen |
| Following dialog | dialog, `overflow-y: auto` | all loaded so far | yes, 12 per fetch | none seen |
| Likes page | `document.scrollingElement` | all (100) | no | 100 |
| Likes dialog | dialog, `overflow-y: auto` | ~11 (windowed) | no | 100 |
