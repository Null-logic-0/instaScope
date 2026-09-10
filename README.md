# InstaScope

Collect the followers, following and likes lists you can already see on Instagram,
from your own logged-in browser session, keep snapshots of them locally, and turn them
into datasets: mutuals, accounts not following you back, new and lost followers.
Optionally, classify profiles and explain changes with a language model that runs on
your own machine through Ollama.

Everything happens in your browser and on your computer. Nothing is sent to any cloud
service.

```js
await instaScope.collectFollowers(); // opens the dialog, scrolls it, stores a snapshot
await instaScope.collectFollowing();
instaScope.stats(); // followers 421, following 380, mutuals 300, …
instaScope.downloadCsv("not-following-back");
```

## How to use it (plain English)

instaScope is a small tool you run inside your own browser while you are logged in to
Instagram. It reads the lists Instagram already shows you (followers, following, likes)
and saves them as files you can open in Excel or Google Sheets.

**What you need**

- A computer with Chrome (or another browser with developer tools).
- [Node.js](https://nodejs.org) version 22 or newer, only to build the tool once.
- Your own Instagram account, logged in as usual.

**Step 1 – build the tool once**

Open a terminal in this folder and run:

```bash
npm install
```

```bash
npm run build
```

This creates a file called `dist/instascope.js`. That file is the whole tool.

**Step 2 – open the list you want on Instagram**

Go to instagram.com, open your profile (or any profile whose lists you can see).
For likes, open a post instead.

**Step 3 – paste the tool into the browser console**

Press `F12` (or `Cmd+Option+J` on a Mac) to open the developer tools and click the
_Console_ tab. Open `dist/instascope.js` in a text editor, copy everything, paste it into
the console and press Enter. The first time, Chrome asks you to type `allow pasting`
first; that is normal.

**Step 4 – collect a list**

Type one of these and press Enter:

```js
await instaScope.collectFollowers();
```

```js
await instaScope.collectFollowing();
```

```js
await instaScope.collectLikes();
```

The tool opens the list, scrolls through it by itself and tells you how many accounts it
found. Keep the browser tab visible while it works; if you switch away it pauses and
continues when you come back.

**Step 5 – get your files**

```js
instaScope.downloadCsv("followers"); // one list
instaScope.downloadCsv("not-following-back"); // people you follow who do not follow you
instaScope.downloadJson(); // a full backup of everything collected
```

The CSV files open directly in Excel, Numbers or Google Sheets. To see who is new or who
left, collect your followers again another day and use `"new-followers"` or
`"lost-followers"`.

**Optional – sort accounts into categories with local AI**

If you install [Ollama](https://ollama.com) on your computer, instaScope can guess a
category for each account (Fitness, Creator, Business, …) and write a short summary of
your numbers. This never leaves your computer. Because Instagram's security settings
block this from inside the Instagram tab, it runs on a small local page instead:

1. Install Ollama and run `ollama pull llama3.2` once.
2. In the Instagram tab, run `instaScope.downloadJson()` to save a backup.
3. Run `npm run workbench` in the terminal and open <http://localhost:4173/>.
4. Import the backup file, press _Classify profiles_, then download any CSV.

If Ollama is not installed, the page still shows your numbers and downloads; only the
AI buttons are disabled.

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
- **Tested without Instagram or Ollama.** Fixtures reproduce the observed markup, a
  fake list plays back the three list shapes Instagram uses, and a fake HTTP layer
  plays back every Ollama outcome.

## Installation

You need Node 22+ to build; nothing is installed on Instagram's side.

```bash
npm install
```

```bash
npm run build
```

This writes `dist/instascope.js` (a single self-contained script) and the workbench
page.

## Collecting

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

A collection that reached the end of the list is also **saved as a snapshot** (see
below). Partial results are returned but never stored, because a partial followers list
would read as mass unfollowing next time.

Keep the tab visible while it runs. Chrome stops rendering a hidden tab, and Instagram
neither loads more rows nor re-renders windowed lists without rendering; instaScope
detects this, pauses, and resumes when the tab is shown again.

### Options

```js
await instaScope.collectFollowers({
  maxUsers: 500, // stop early with stopReason "target_reached"
  timing: { loadTimeoutMs: 15000 }, // wait longer for slow connections (default 8000)
});
instaScope.cancel(); // stop the running collection; partial results are returned
```

## Snapshots, datasets and statistics

Every complete collection is stored in the browser's `localStorage` for the page's
origin as a snapshot: which usernames were in which list of which account, and when.
Profile details (display name, URL, first and last time seen, AI classification) are
kept once per username. Thirty snapshots per list are retained.

Deterministic set arithmetic over the latest snapshots gives the datasets:

| Dataset              | Meaning                                                   | File                      |
| -------------------- | --------------------------------------------------------- | ------------------------- |
| `followers`          | latest followers snapshot                                 | `followers.csv`           |
| `following`          | latest following snapshot                                 | `following.csv`           |
| `mutuals`            | in both lists                                             | `mutuals.csv`             |
| `not-following-back` | you follow them, they do not follow you                   | `not-following-back.csv`  |
| `fans`               | they follow you, you do not follow them                   | `fans.csv`                |
| `new-followers`      | in the latest followers snapshot but not the previous one | `new-followers.csv`       |
| `lost-followers`     | in the previous followers snapshot but not the latest     | `lost-followers.csv`      |
| `snapshot`           | everyone in either list, with their relationship          | `snapshot-2026-09-10.csv` |

```js
instaScope.subjects(); // accounts with snapshots
instaScope.stats(); // counts for the latest account (or stats("username"))
instaScope.dataset("mutuals"); // rows as objects
instaScope.exportCsv("lost-followers"); // CSV string
instaScope.downloadCsv("snapshot"); // browser download
```

CSV columns are `username, display_name, profile_url, relationship, first_seen,
last_seen`, plus `category, confidence` once any row has been classified. Fields are
quoted per RFC 4180, values that a spreadsheet would treat as formulas are neutralised,
and downloads carry a UTF-8 byte order mark so Excel decodes non-ASCII names.

### JSON backup

```js
instaScope.downloadJson(); // instascope-backup-2026-09-10.json
await instaScope.importJson(fileOrString); // merges: earliest first seen, newest details
```

The backup is the whole store and is the canonical format; CSV is the interoperability
format derived from it. Import validates every record and merges rather than replaces,
so backups from two machines can be combined.

## Workbench and local AI

Instagram's Content Security Policy forbids its pages from connecting to `localhost`,
so nothing running inside the Instagram tab can talk to Ollama. The **workbench** is
the same bundle on a page served from your machine:

```bash
npm run workbench
```

Open <http://localhost:4173/>, import a backup exported from the Instagram tab, and you
get the datasets, statistics and downloads plus the AI features. The page works without
Ollama; the AI section just reports that it is unavailable.

### Ollama

[Ollama](https://ollama.com) runs open models locally. Install it, then:

```bash
ollama pull llama3.2
```

Ollama accepts requests from `localhost` pages by default, so no configuration is
needed for the workbench. The page shows one of:

| State              | Meaning                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Ollama unavailable | the server is not running or not reachable; AI features are disabled, everything else works |
| Model unavailable  | the server runs but the configured model is not installed (`ollama pull …`)                 |
| Model ready        | classification and reports can run                                                          |

Change the server or model in the page, or from the console:

```js
await instaScope.ai.status();
instaScope.ai.configure({
  model: "gemma3:4b",
  baseUrl: "http://localhost:11434",
});
```

### Profile classification

```js
await instaScope.ai.classify(); // every stored profile
await instaScope.ai.classify({ dataset: "mutuals" }); // one dataset
await instaScope.ai.classify({ force: true }); // re-classify
instaScope.ai.cancel();
```

Profiles are sent in batches of 20 (about 1 200 tokens per request, well inside the
default 4 096-token context) and the model must answer in a JSON schema whose
`category` is an enum of the category list. The answer is still treated as untrusted:
every entry must name a username from the batch, a category from the list and a
finite confidence between 0 and 1; anything else is dropped. Accounts the model leaves
out get one more pass. Results are written after every batch, so cancelling keeps what
is done and the next run skips it: `Classifying profiles: 250 / 1000` is exactly where
it resumes.

Categories default to Technology, Business, Creator, Fitness, Travel, Education, News,
Personal and Other, and can be replaced per run with `categories: [...]`.

**What the model sees is only the username and display name.** That is thin evidence;
expect many `Personal` and `Other` labels with low confidence, and treat the column as
a hint, not a fact. Larger models do not help much here because there is little more
to reason about.

### Snapshot report

```js
const { stats, text } = await instaScope.ai.report();
```

The numbers are computed by instaScope; the model only receives them as labelled
lines and writes a few sentences. Even so, small models occasionally misstate a
number, so the deterministic statistics are always shown next to the text.

### Privacy and security

- Ollama runs on your machine; the workbench talks to `http://localhost:11434` and to
  nothing else. There is no telemetry.
- Model output is parsed as data. instaScope never executes anything a model returns,
  never gives a model access to the store or the page, and validates every field
  before storing it.
- Display names are user-controlled text and are included in prompts; a malicious name
  can at most mislabel its own profile, because the schema and validation bound what
  the model can return.

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
        │
        ▼
store snapshot → datasets / statistics → CSV, JSON backup
                                          └─ optional: Ollama → classification, report
```

Three details carry most of the weight:

- **A row is the largest subtree containing exactly one profile link.** Instagram's rows
  have no semantic marker, but the identity link is stable. Starting from the _first_
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
├── console.ts             collection commands, snapshots, datasets, exports
├── collector.ts           the collection loop
├── analytics.ts           datasets and statistics from snapshots (deterministic)
├── core/                  DOM and async primitives, no Instagram knowledge
│   ├── scrolling.ts, wait-for-change.ts, visibility.ts, click-and-wait.ts, user-set.ts
├── instagram/             everything that assumes Instagram's markup
│   ├── profile-link.ts, discovery.ts, extraction.ts, loading.ts, profile-header.ts
├── features/              collectFollowers, collectFollowing, collectLikes
├── store/                 localStorage-backed snapshots and profiles, JSON backup
├── output/                CSV serializer, dataset columns, download and clipboard
└── ai/                    optional layer
    ├── ollama.ts          HTTP client: status, models, chat with JSON-schema output
    ├── classify.ts        batching, validation, resumable storage of results
    ├── report.ts          statistics → explanation
    └── console.ts         instaScope.ai
workbench/                 the local page (HTML, css/, js/), copied into dist/
scripts/                   build.mjs, serve.mjs
```

`core/` knows nothing about Instagram. `instagram/` is the only place that encodes
its markup. `ai/` depends on the store and analytics; nothing depends on `ai/`, which
is what keeps the application whole when Ollama is absent.

## Limitations

- **Instagram caps the likes list at 100** accounts in the web UI. instaScope returns
  what Instagram renders; it does not call private APIs.
- **The tab must stay visible** while collecting; instaScope pauses rather than guessing.
- **Only what your session can see.** Private accounts you do not follow have no
  clickable counts, and `collectFollowers()` reports that instead of opening anything.
- **Storage is per browser and per origin.** Snapshots taken in the Instagram tab live
  in that tab's `localStorage`; move them with a JSON backup. Very large accounts
  (hundreds of thousands of followers) will hit the browser's storage limit.
- **Classification is name-based** and therefore rough; see above.
- **Instagram changes.** When discovery breaks, expect `collect…()` to throw a
  descriptive error or return `end_of_list` with zero users; fix `src/instagram/` and
  the fixtures together.

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
(growing pages, sliding window, static page); `tests/helpers/fake-ollama.ts` plays
Ollama's responses, errors, timeouts and hangs, so no test needs a real installation.

To debug against the real site, build, paste the bundle into the console, and pass an
`onProgress` callback. Instagram's Content Security Policy forbids `eval`, so the
bundle has to be pasted or loaded from a `blob:` URL.

## Contributing

Contributions are welcome. The easiest way to help:

1. **Report what broke.** If a collection stops working, open an issue with the output
   of `instaScope.collectFollowers()` (it prints why it stopped) and, if you can, the
   result of the inspection snippet in [docs/instagram-dom.md](docs/instagram-dom.md).
   Do not paste usernames or personal data; the shape of the markup is what matters.
2. **Fix it with a fixture.** Instagram-specific assumptions live only in
   `src/instagram/`. When the markup changes, add or update an HTML fixture in
   `tests/fixtures/` that reproduces the new structure, make the tests fail, then make
   them pass. A fix without a fixture will break again silently.
3. **Keep the rules that keep it working.** No generated class names, no fixed
   `setTimeout` delays for synchronisation, no network calls to anything but Instagram
   itself and a local Ollama, and every model output validated before it is stored.

Before opening a pull request:

```bash
npm run check
```

This runs the type checker and the full test suite; both must pass. Keep pull requests
small and focused, write commit messages that say _why_, and describe how you tested
against the real site if you did. Code in this repository is written without explanatory
comments; put the explanation in the pull request instead.

Ideas that would be welcome: reading the exact follower count from the profile header to
report "collected 950 of 1 000", a faster path for very large non-windowed lists, and a
continuous-integration workflow that runs `npm run check`.

## Licensing

instaScope is released under the MIT License (see `LICENSE`).

It is a clean-room reimplementation of the idea behind the older GPL-licensed
`instagram-parser` console script: it was written from the observed behaviour of that
tool and of Instagram's current markup, not from its source. No code from
`instagram-parser` was copied, adapted or translated, which is what makes an independent
licence possible. Renaming variables or restructuring copied code would _not_ have made
it independent; not copying did.
