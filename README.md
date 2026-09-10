# instaScope

Collect the followers, following and likes lists you can already see on Instagram,
from your own logged-in browser session, as structured data.

It runs in the DevTools console of instagram.com, drives the same dialogs you would
scroll by hand, and returns `{ username, displayName, profileUrl }` for every account in
the list. Nothing is sent anywhere; the result stays in your browser until you download
it.

```js
const result = await instaScope.collectFollowing();
// [instaScope] following: 60 users, reached the end of the list (6s)
instaScope.downloadCsv(result.users, "following.csv");
```

## Why a rewrite

The original `instagram-parser` was a console script built on Instagram's generated
class names (`isgrP`, `jSC57`, `_6xe7A`, …). Those classes are hashed build artefacts
that change without notice, so the script broke on every redeploy. It also scrolled on
fixed timers and patched `Array.prototype` to deduplicate.

instaScope keeps the idea and replaces the mechanics:

- **No class names.** Discovery uses the one thing a list row cannot lose without
  changing its meaning: the profile link `a[href="/username/"]`. Everything else, the
  row, the list, the scroll container, is derived from that link by structure.
- **No sleeps.** Scrolling waits for the DOM to change (`MutationObserver`), with a
  timer only as an upper bound.
- **Honest stop reasons.** A run ends with `end_of_list`, `target_reached`, `stalled`
  or `cancelled`, always with the users collected so far.
- **Tested without Instagram.** Fixtures reproduce the observed markup; a fake list
  plays back the three list shapes Instagram uses.

## Installation

You need Node 22+ to build the bundle; nothing is installed on Instagram's side.

```bash
npm install
```

```bash
npm run build
```

This writes `dist/instascope.js`, a single self-contained script.

## Usage

1. Log in to instagram.com in Chrome (or any browser with DevTools).
2. Open the page for the list you want:
   - **followers / following**: any profile whose lists you can view
   - **likes**: a post, opened as a page or as a modal from a grid
3. Open DevTools → Console. The first time you paste, Chrome asks you to type
   `allow pasting`; do so.
4. Paste the contents of `dist/instascope.js` and press Enter. This defines
   `instaScope`.
5. Run one of:

```js
const result = await instaScope.collectFollowers();
const result = await instaScope.collectFollowing();
const result = await instaScope.collectLikes();
```

Each call opens the dialog itself, logs progress every couple of seconds, and resolves
with:

```ts
interface CollectionResult {
  users: { username: string; displayName?: string; profileUrl: string }[];
  stopReason: "end_of_list" | "target_reached" | "stalled" | "cancelled";
  rounds: number;
}
```

Keep the tab visible while it runs. Chrome stops rendering a hidden tab, and Instagram
neither loads more rows nor re-renders windowed lists without rendering; instaScope
detects this, pauses, and resumes when the tab is shown again.

### Options

```js
await instaScope.collectFollowers({
  maxUsers: 500,                  // stop early with stopReason "target_reached"
  timing: { loadTimeoutMs: 15000 } // wait longer for slow connections (default 8000)
});
instaScope.cancel();              // stop the running collection; partial results are returned
```

### Output

```js
instaScope.toJson(result.users)                  // string
instaScope.toCsv(result.users)                   // string, RFC 4180, formula-safe
instaScope.downloadJson(result.users, "a.json")  // triggers a browser download
instaScope.downloadCsv(result.users, "a.csv")
await instaScope.copyToClipboard(instaScope.toCsv(result.users))
console.table(result.users)
```

## How it works

```text
open the dialog (click the count control, wait for a new [role=dialog])
        │
        ▼
┌─ each round ────────────────────────────────────────────────────────┐
│ re-resolve the root (topmost dialog or <main>)                      │
│ discover: profile links → row → list → scroll container             │
│ extract users from the rows, add to a username-keyed set            │
│ not at the bottom → scroll one viewport, wait ≤150 ms for changes   │
│ at the bottom     → wait for the DOM to change, up to the patience  │
│                     (8 s while Instagram shows a spinner, else 1.5 s)│
│ no growth for the whole patience → stop                             │
└─────────────────────────────────────────────────────────────────────┘
```

Three details carry most of the weight:

- **A row is the largest subtree containing exactly one profile link.** Instagram's rows
  have no semantic marker, but the identity link is stable. Starting from the *first*
  link also keeps the followers dialog's "Suggested for you" section out, because those
  rows live under a different parent.
- **The scroll container is the nearest ancestor with `overflow-y: auto|scroll` that
  actually overflows.** Instagram's list wrapper is scrollable by style but never
  overflows, so style alone picks the wrong element.
- **Stopping is elapsed-time based.** Unrelated mutations wake the loop but cannot
  extend a deadline; the loading spinner only chooses how long to wait and whether the
  end is reported as `stalled` or `end_of_list`.

The list shapes Instagram uses, and the measurements behind every assumption above, are
in [docs/instagram-dom.md](docs/instagram-dom.md). That document is the place to start
when Instagram changes its markup.

## Architecture

```text
src/
├── index.ts               console entry: window.instaScope
├── console.ts             progress logging, cancel(), stop-reason messages
├── collector.ts           the collection loop
├── core/
│   ├── scrolling.ts       read position, step one viewport
│   ├── wait-for-change.ts MutationObserver | timeout | AbortSignal
│   ├── visibility.ts      pause while the document is hidden
│   ├── click-and-wait.ts  click a control, wait for a condition
│   └── user-set.ts        username-keyed, first-seen order
├── instagram/             everything that assumes Instagram's markup
│   ├── profile-link.ts    "/alice/" → "alice"
│   ├── discovery.ts       dialog, rows, list, scroll container
│   ├── extraction.ts      row → User
│   ├── loading.ts         spinner hint
│   └── profile-header.ts  followers / following controls
├── features/
│   ├── follow-list.ts     collectFollowers, collectFollowing
│   └── likes.ts           collectLikes
└── output/
    ├── format.ts          toJson, toCsv
    └── browser.ts         download, clipboard
```

`core/` knows nothing about Instagram. `instagram/` is the only place that encodes
its markup, and each file there is small enough to rewrite in an afternoon.
`collector.ts` composes the two; `features/` decide which surface to open.

## Limitations

- **Instagram caps the likes list at 100** accounts in the web UI, on both the likes page
  and the likes dialog. instaScope returns what Instagram renders; it does not call
  private APIs.
- **The tab must stay visible.** See above; instaScope pauses rather than guessing.
- **Only what your session can see.** Private accounts you do not follow have no
  clickable counts, and `collectFollowers()` reports that instead of opening anything.
- **Instagram changes.** Discovery avoids class names, but it still assumes a profile
  link per row, a dialog for follower lists, and a three-cell stats row in the profile
  header. When one of those changes, expect `collect…()` to throw a descriptive error
  or to return `end_of_list` with zero users; fix `src/instagram/` and the fixtures
  together.
- **Rate limits are Instagram's.** Large lists take time because each page is one
  request Instagram makes on your behalf. instaScope does not retry, hide, or speed up
  anything.

## Development

```bash
npm run check      # typecheck + tests
```

```bash
npm run test:watch
```

Tests run in Vitest with happy-dom. happy-dom has no layout engine, so fixtures declare
observed geometry through `data-scroll-height` / `data-client-height`, and
`tests/helpers/scroll-simulator.ts` reproduces the browser's clamping and asynchronous
scroll notification. `tests/helpers/fake-list.ts` plays the three list shapes
(growing pages, sliding window, static page) so the loop is exercised end to end.

To debug against the real site, build, paste the bundle into the console, and pass an
`onProgress` callback. Note that Instagram's Content Security Policy forbids `eval`, so
the bundle has to be pasted or loaded from a `blob:` URL; it cannot be injected with
`eval` or `new Function`.

## Licensing

instaScope is licensed under the GNU General Public License v3.0 (see `LICENSE`), the
same licence as the original `instagram-parser`.

It is a clean-room reimplementation: it was written from the observed behaviour of the
original tool and of Instagram's current markup, not from the original source. No code
from `instagram-parser` was copied, adapted or translated, so this licence is a choice
made to stay compatible with the project it replaces rather than an obligation
inherited from it. Renaming variables or restructuring copied code would *not* have
made it independent; not copying did.
