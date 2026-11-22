# Known issues & deferrals

Status as of the **T16 ship pass**. **Phase 2 is complete and live** at
https://car-log-project.web.app

Items that are still open but *shouldn't block the release* live in
[POLISH.md](POLISH.md) — nothing from this file was dropped, every Phase 1
deferral below has been re-triaged and either closed or moved there.

---

## Fixed during T8 (Phase 1 hardening)

| # | Issue | Fix |
|---|---|---|
| 1 | `users/{uid}` validated ownership but not shape — a user could write unbounded junk into their own profile, and `username` propagates into group `members` maps and notifications | Key whitelist, username 1–20, email ≤320, no delete path |
| 2 | `joinRequests.create` accepted any-length `username`, which an accept copies into the group document for everyone | Capped at 20 characters |
| 3 | `groups/{id}/public/{docId}` — the only doc readable outside a group — had no key whitelist, so an owner could park arbitrary content readable by every signed-in user | Exactly `{name, ownerId}` enforced |
| 4 | Deleting a group orphaned its `public/info`, leaving an invite link that showed a real name and a Request button that could only fail | Both documents deleted in one batch |
| 5 | Offline writes hang silently — Firestore queues them and the promise never settles, leaving buttons on "Processing…" | Persistent offline banner; the honest message is "will sync when you reconnect" |
| 6 | Dead code from removed features: orphaned `ComingSoon` component, `home.notifications*` / `groups.membersTitle` / `groups.ownerBadge` strings, `.group-member*` CSS | Deleted |
| 7 | No cache headers — `index.html` could be cached, pinning users to a stale build | `/assets/**` immutable for a year (Vite fingerprints them); HTML `no-cache` |

---

## Fixed during T16 (Phase 2 ship pass)

| # | Issue | Fix |
|---|---|---|
| 8 | **Deleting a group orphaned every car and log under it.** Predicted in this file at the end of Phase 1 and came due the moment cars existed. Not merely untidy: a car doc can hold a 250,000-character photo, and once the group is gone the rules make it unreadable *and* undeletable by anyone — a permanent charge against the 1GB free tier that nobody can reclaim | Full client-side cascade in `deleteGroup`, deepest first (logs → cars → group), because every child's delete rule calls `groupExists()` |
| 9 | **`groups/{id}` had no key whitelist.** The last write path in the rules without one. An owner could park an arbitrary field on their own group — and unlike a profile, a group is read by *every member* on a live listener, so junk here is downloaded by everyone and re-downloaded on every change | `hasOnlyGroupFields()`, applied *outside* the branch list so the departing-member path can't skip it |
| 10 | **`joinRequests` had no key whitelist either.** The only document a non-member writes and an owner reads, which is why `username` was already length-capped in T8 — an open key set walked straight around that cap | `hasOnlyRequestFields()` on both create and update |
| 11 | **An unrecognised notification type was coerced to `join_request`**, so a tab left open across a deploy would render a future notification as words somebody never said. Indexing the icon map with it would have thrown mid-render | `RenderableType`'s `"unknown"` case: a generic sentence, a neutral icon, still opens the group |
| 12 | **`request_declined` deep-linked into a group the reader isn't in**, producing "Group not found" — which reads as a broken app rather than as the answer | Dead-ends like `removed_from_group`; still marks read so the badge clears |
| 13 | **`join_request` opened the group page**, leaving the owner to go find the pending list | Opens `/groups/:id/members`, where Accept and Decline live |
| 14 | **`access_changed` named one car but could only open the group.** "You can now edit Mum's Myvi" → go find Mum's Myvi | `carId` added to the payload and to the rules, existence-checked like `isDueNotice`'s, because it becomes a URL somebody follows |
| 15 | Dead design tokens: `--color-primary-strong` / `-dark` / `-border`, `--control-height-sm`, `--shadow-tab` / `-fab` — all unreferenced. A token nothing reads is a value that can drift out of contrast compliance with nobody noticing | Deleted from both accent sets |
| 16 | `.blob-blue` / `.blob-orange` — hue-named classes left over from an accent set the app no longer has, sitting on tokens already renamed to roles | `.blob-top` / `.blob-bottom` |

---

## Fixed during fine-tuning batch 1 (2026-07-27)

Five reported bugs. Three had a root cause other than the one suspected, which
is the most useful thing in this table — the suspicion is recorded next to what
was actually wrong.

| # | Issue | Suspected | Actual root cause | Fix |
|---|---|---|---|---|
| 17 | **Display name could not be edited.** Chosen once on the first-run screen and permanent thereafter | Rules — written but not deployed, or a write shape that didn't match | **Neither. There was no Settings screen at all.** `ChooseUsername` was the *only* writer of `users/{uid}.username` in the entire app, and `users.update` had always permitted the write. Nothing was blocking it; nothing was asking for it. `specs/phase-2/tasks.md` claimed SET1–2 were "live on the deployed site" — they were never built | `pages/Settings` [SET1, SET2], reached from the account menu. New `renameUsername` in `AuthController` + `renameUser` in `userProfile.ts` |
| 17a | …and the same name is **denormalised onto every group** as `members[uid].username`, which is what the members panel, access grid and request rows actually render | — | Writing only the profile document would have shipped a screen that looks like it saves and changes nothing anyone can see | Fan-out: profile first, then one `members[uid].username` update per group, chunked at Firestore's 500-write batch limit. New `isOwnUsernameUpdate()` rules branch — the first non-owner write to a group that isn't leaving it. 17 tests in `tests/rules/rename.test.ts` pin what it still refuses |
| 18 | **Scroll broke in two halves**, worst on the car page | Nested `overflow-y: auto` inside an `h-screen` shell, and/or `100vh` on iOS | **`overflow-x: hidden` on `.app-page`.** It reads as "don't scroll sideways", but per spec it forces the *other* axis from `visible` to `auto` — silently making the page shell a second scroll container nested in the document's. It had real overflow to scroll, too: `.blob-bottom` sits at `bottom: -12%`, hanging 12% of the page height past the edge. Tallest page = biggest overhang = why the car page was worst. `100dvh` was already correct everywhere | `overflow-x: clip` (with `hidden` retained above it as the pre-Safari-16 fallback). `clip` does not establish a scroll container, so `overflow-y` stays `visible` and the document is the only scroller |
| 19 | **iOS force-zoomed on focusing a form field** | Any input under 16px | **Not reproducible — already correct, and verified against the deployed stylesheet.** `index.css` has floored `input, select, textarea` at `max(var(--text-body), 16px)`; the only two overrides are *larger*. `inputMode` was likewise already complete on both odometer fields, the cost field (`decimal`) and the interval editor | No behaviour change. Locked in by `src/styles/layout.invariants.test.ts`, which parses the real stylesheets so a sub-16px control or a stray scroll container fails a test instead of a phone |
| 20 | **Brand list incomplete when adding a car** | The dropdown slicing, limiting or paginating | **Neither end was slicing anything — the data was just short.** `cars-my.json` shipped 9 brands, and `brandNames()` renders all of them. The file's own comment said it was "deliberately not exhaustive", which is defensible for a long tail and not for Kia | Expanded to **39 brands / 297 models**. Perodua and Proton lead; everything else alphabetical; "Other" still pinned last by `brandNames()`. Native `<select>` kept — it gives type-ahead free on desktop and the OS picker on phones |
| 21 | **Desktop hover lag** | `transition-all` transitioning layout properties; or hover re-rendering `onSnapshot` lists | **Neither. There is no `transition-all` in any hover path** (the one instance is in `ToastMessage`, unrelated) and **no JS hover state anywhere** — every hover is pure CSS, already restricted to `color` / `background-color` / `border-color` / `transform`. The cost was `filter: blur(140px)` on the two backdrop blobs: unpromoted, they shared a layer with the content above them, so every hover repaint re-rasterised a 140px blur over a 60%×40% box | `will-change: transform` on `.blob`, putting each on its own compositor layer. The blur rasterises once; hover repaints become a cheap composite |

---

## Accepted residual risk

**Notification spam, narrow.** Someone who already knows a group's auto-ID could
send its owner one well-formed `join_request` notification without holding a
valid token, since rules evaluate each document in a batch independently. The
content isn't free-form — `groupName` must match the real group and `username` is
length-capped — so it's noise, not phishing. Closing it entirely would mean
putting the token in the notification payload.

**Group IDs are the only secret protecting `public/info`.** Any signed-in user who
knows a group's 20-character auto-ID can read its name (and nothing else). Those
IDs are unguessable and only travel in invite links.

**An owner can add any uid to their own group** without a matching request. They
could accept any request anyway, so this grants nothing extra; rules validate the
*shape* of a membership change, not that a request exists for it.

**Denormalised counters are trusted, not verified.** `totalSpend`, `spendByYear`,
`carCount`, `groupsOwned` and `lastByType` are all maintained by the client in
the same batch as their triggering write. Rules evaluate a batch's writes
independently, so no rule can check that a counter change accompanied a real
log — this is stated in `firestore.rules` at each site. T14's **Recalculate
totals** is the repair, and it is deliberately a *repair* rather than a
guarantee. Consequence worth naming: Recalculate is owner-only as a product
decision about a heavy read, **not** as a security boundary — any edit holder
can already move these numbers, and must be able to, because logging a service
does exactly that.

**Two devices can double-notify.** `useDueNotifications` detects a status
crossing on render; two clients opening the app in the same second can both
detect it before either `statusStamp` lands. One round trip wide, cosmetic,
deliberately unsolved — a deterministic document id would collapse the
duplicate but then collide when the same car+type crosses again next year.
[R4c]

---

## Not bugs, but worth knowing

- **The bundle is ~1.35 MB raw / ~402 kB gzipped**, dominated by the Firebase
  SDK. The QR scanner is already split out and loaded only on Scan. Further
  splitting is tracked in POLISH.md.
- **`react-refresh/only-export-components` is disabled for `src/context/**`** —
  providers and their hooks live in one file by convention here. Costs
  fast-refresh granularity in dev, nothing in production.
- **`act(...)` warnings in test output** come from `UserContext`'s async session
  mapping. Benign; tests pass.
- **`firestore.indexes.json` holds one composite index** (`logs` by `type` +
  `date desc`), needed by the `lastByType` recompute. It deploys with
  `firebase deploy --only firestore`.
