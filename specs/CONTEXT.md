# Journey Care — CONTEXT

Standing decisions and hard-won lessons. This file is the "why"; each phase's
`spec.md` is the "what", `plan.md` the "how", `tasks.md` the order.

`tasks.md` has cited this file since T0 (decision #6, the read-amplification
lesson) while it didn't exist — those citations resolve here now.

---

## Status

| | |
|---|---|
| **Phase 1** | ✅ Complete and deployed. T1–T8, plus a polish pass. |
| **Polish pass** (2026-07-27) | ✅ Complete. Design refresh, mobile-first rebuild, group screen split into three, home split into owned/joined, branded loading, notifications root cause fixed, sign-out moved off the top bar. |
| **Phase 1 additions** | ✅ **G12 group rename** (owner-only, notifies every other member) and the **accent swap** (deep teal, plus a near-monochrome set behind `?theme=mono`). Both landed after Phase 2 T9. |
| **Phase 2** | ✅ **COMPLETE AND DEPLOYED** (2026-07-27, T16). T9–T16: bundled car data, add-car, the car page, the odometer guard, own photos, the per-car access grid, maintenance logs with their denormalised totals, next-due with in-app reminders, the spend dashboard with its Recalculate repair, and the notification/hardening pass. The **CarImages gate came back STRIPPED** (API defunct, successor paid). |
| **Phase 3** | ✅ **CODE COMPLETE, DEPLOYED, awaiting Shirley's manual gates** (2026-07-29, T17–T24). Visit-based logging, parts shelf, en/ms/zh dictionaries, spend viz (donut + monthly bar + per-car bar, recharts lazy-loaded), AI intake for receipts + odometer (behind `AI_CONFIG.scanEnabled` — HANDOFF for enable steps). Rules deployed at every task boundary. See `specs/phase-3/HANDOFF.md` for the manual ledger. |
| **Live** | https://car-log-project.web.app — hosting, rules and indexes all deployed at T16. |
| **Gates at ship** | 372 vitest ✅ · 318 emulator rules tests ✅ · lint ✅ · `tsc --noEmit` ✅ |
| **Open** | Nothing blocking. [`POLISH.md`](../POLISH.md) holds the fine-tuning backlog; [`BUGS.md`](../BUGS.md) holds what was fixed and what risk is accepted. |

Phase 2's defaulted decisions **D1–D5 were approved as written** and all five
shipped unchanged — see *Phase 2 decision log* below for how each landed.

---

## Phase 2 decision log — as built

Written at T16, against the shipped code rather than the plan.

### D1 — Spend scope: current year on home, all-time on the group page ✅ as written
Home's `SummaryStrip` reads `group.spendByYear[currentYear]`; the group page
sums `car.totalSpend` across its cars; the car page pairs its own stored total
with a by-type breakdown. **The year boundary needed no handling at all** — the
year is read at render, so 1 January asks for a bucket nobody has written and
gets RM 0.00, and the first log of the new year creates the key through T12's
existing batch. Nothing rolls over, so nothing can roll over wrongly.

The one thing D1 didn't anticipate: the car page's headline and its breakdown
have **different provenance**. The total is a lifetime counter; the breakdown is
summed from the page of history that happens to be loaded. They can legitimately
disagree, so the panel says so rather than letting the columns quietly fail to
add up.

### D2 — Settings: display name, email, sign out, about ✅ as written
Delete-account stayed deferred; it needs the data-cleanup design that T16's
group-delete cascade turned out to be half of.

### D3 — No km/day projection ✅ as written
Next-due is a fixed interval from the last service. Never revisited, and the
45-test `lib/nextDue.ts` suite is the better investment.

### D4 — Photos in the Firestore document, not Storage ✅ as written, and verified
Storage did ask to upgrade to Blaze, so the default stood. The budget is
**250,000 characters of data URL** client-side against a **350,000-character**
rules guard — characters, not kilobytes; see *Photos live in the document*.

### D5 — Reminders in-app only ✅ as written
No FCM, no push. R4a narrowed the audience from "can view" to "holds edit" —
the one amendment to a D-decision in the whole phase, and it's recorded in
`phase-2/spec.md`.

### The CarImages gate (C4) — STRIPPED
`api.carimagery.com` no longer resolves and its successor sells access at
$19.99/month, which decision #1 forbids. This stopped being a "do Malaysian
models resolve?" question and became a cost question with one answer. **C4 is
not built**, `imageUrl` exists nowhere in the document or the rules, and the
precedence is `photo ?? placeholder`. No replacement API was sought —
deliberately, per the timebox. Full reasoning in *The CarImages gate* below.

### Body-type illustrations — CONSIDERED AND DROPPED
With C4 stripped, a set of hand-drawn body-type placeholders (hatchback, sedan,
SUV, pickup) chosen from the model in `cars-my.json` was the obvious fallback:
it would have made a Myvi and a Hilux look different without any API at all.
Not built. The car image slot is `photo ?? one generic lucide car icon`, the
same mark for every vehicle.

The reason to leave it: the own-photo path (C5) already solves the real problem
for any car anyone cares about, and it produces a *photograph of your actual
car* rather than a drawing that approximates it. An illustration set is
decoration for the cars nobody has photographed yet — worth having, never worth
blocking a phase on. It sits in `POLISH.md` if the placeholder starts to grate.

### Bulk access — CONSIDERED AND DROPPED
`AccessGrid` toggles exactly one member × one car per switch. A select-all (per
row, per column, or both) was considered and left out.

The reason is the same one that split the access grid off the members panel in
the first place: that screen already carries two kinds of switch, and T11's note
records that two was one too many to explain. A bulk control would be a third —
and a mis-tap on it grants edit on every car at once, which is precisely the
action per-car access exists to prevent being casual. At family scale the grid
is three members × two cars; the bulk saving is a few taps against a permission
mistake that is silent.

### The accent is deep teal, chosen at runtime
Orange read as food delivery. Two accent sets live in `tokens.css` — teal by
default, near-monochrome under `?theme=mono` — and **no component stylesheet
knows which is active**. `tokens.contrast.test.ts` parses the real stylesheet
and enforces WCAG AA plus a hue gap between the accent and the status colours,
for both sets. See *Two accent sets, one token file*.

---

## Decisions

1. **Zero cost, permanently.** Firebase Spark tier, no paid services or APIs. If
   a feature seems to need one, stop and ask rather than designing around it.
2. **Web only, responsive.** No Android or iOS builds. Phone users use the
   responsive web app in their browser. QR scanning uses `getUserMedia`;
   desktop uses the paste-a-link path.
3. **Server-side security.** Permissions are enforced in `firestore.rules`,
   never only in the UI. Every new read/write path needs a matching rule and a
   test in `tests/rules/`.
4. **No Cloud Functions in Phase 1.** Keeps the project card-free. The
   join-accept flow uses the constrained-rules approach in `plan.md`.
5. **Spec-driven.** Don't build what the current phase spec doesn't describe.
6. **Access is per-car, not per-group.** Group membership grants visibility;
   the owner elevates access car by car. T6 planned for `MembersPanel` to grow
   car columns; T11 gave per-car access its own panel instead — see *The access
   grid is its own panel* below for why.
7. **A requester can never write themselves into a group.** The only path into
   `memberIds` is an owner-authenticated update adding exactly one uid. A
   would-be member can write nothing but a `pending` request about themselves.
   `tests/rules/joinRequests.test.ts` encodes the attack cases — **treat those
   tests as the spec.**
8. **`username` comes from Firestore and nowhere else.** `UserContext`
   deliberately does not fall back to the provider `displayName`: an empty
   username is the signal that routes to the username screen, so a fallback
   would silently skip it. `displayName` is kept in `nickname` and used only as
   an editable prefill.
9. **The accent is deep teal, and swapping it is a token-only change.** Orange
   read as food-delivery. Two accent sets now live in `tokens.css` — teal by
   default, near-monochrome under `?theme=mono` — and **no component stylesheet
   knows which is active**. If a screen ever needs a colour edit to follow a
   theme change, that screen has a leftover hardcode: fix the wiring in
   `tokens.css`, don't patch the screen. See *Two accent sets* below.

## Phase 3 decisions (added T17 onward)

19. **AI provider = Firebase AI Logic with the Gemini Developer API backend.**
    Available on Spark, no card, no key in the client, App Check enforced.
    Vertex backend is Blaze — do not pick it. See phase-3/spec.md.
20. **AI extracts facts; the app computes dates.** Model returns receipt facts
    and odometer readings only. Next-due comes from `nextDue.ts`. One source
    of truth for computed dates.
21. **Draft-then-confirm everywhere.** Receipt scan → pre-filled visit form;
    odometer scan → old-vs-new confirm. Manual entry is always one tap away.
22. **Model name from `app/config.aiModel`, not code.** Model churn must not
    require a deploy.
23. **Charts: decision #13's "no charts" is REVERSED — sparingly.** Three
    charts max, from denormalised totals only (never log history), recharts
    lazy-loaded. Home strip stays numbers-only.
24. **i18n: UI-only, en/ms/zh, per-user setting.** `users/{uid}.language` +
    local cache. Notifications MUST render from `type + params` at display
    time in the reader's language.
25. **Parts spend counts at INSTALL, not purchase.** On-hand parts affect no
    timer and no dashboard; shelf shows its own value line. One accounting
    path = Recalculate stays logs-only.
26. **No gating features: landing page, access codes, group/car limits are
    CUT.** QR/URL invite + owner-approval remains the sole access control.
    `carCount` and `groupsOwned` counters STAY as the re-enable path.

## T19 — I18N5 rendering: raw params next to point-in-time strings

⟨VERIFY current notification docs store type + params, not pre-rendered
text⟩ — RESOLVED. Notifications DO store `{type, payload}` where the
payload has structured fields (groupId, groupName, carId, carName,
typeLabel, dueLabel, granted, etc.). Some fields are POINT-IN-TIME
display strings (`dueLabel`, `typeLabel`, `carName`) — deliberate, so
renaming a car later doesn't rewrite a notification you already read.

T19 adds RAW companions for the fields that matter most for reader-language
rendering — `dueDateMs` and `dueKm` on due-notices — without touching
stored data. The render path prefers raw when present:

- New due notifications carry both `dueLabel` (English/sender's language,
  point-in-time) AND `dueDateMs`/`dueKm` (raw, reader-formatted).
- `NotificationsPage.localiseDueLabel` uses raw + `locale.due.byDate`/
  `locale.due.atKm` when present; falls back to stored `dueLabel` for
  pre-T19 records (accepting they render in the sender's language).

Left for a follow-up:
- Preset maintenance-type name translation (I18N3): would need a per-preset
  i18n key map in maintenance-types.json + a preset render helper. Custom
  types and user input already render verbatim per I18N3.
- `carName` in notifications: also point-in-time; a full raw refactor
  would touch every notification type. Not blocking G-H at the templates
  level; the sentence templates translate.

## T18 — parts shelf: three transitions, one accounting path

The parts subcollection has three transition shapes each rule-validated:

- **create** (`on_hand`) — a fresh part, no `installedLogId`.
- **install transition** (`on_hand` → `installed`) — must carry a
  non-empty `installedLogId`, cost is IMMUTABLE. The rules can't verify
  the sibling log exists in the batch (batches evaluated per-write), so
  the shape check is what stops a spurious install. The cost lock reflects
  decision #25: the moment the flip happens, the visit's car update has
  already counted the cost, and moving the value here would double it.
- **revert transition** (`installed` → `on_hand`) — `installedLogId`
  must be gone. Written by `deleteLog` when a log has a linked part.
- **shelf edit** (`on_hand` → `on_hand`) — fixing a typo before install.

Recalculate remains logs-only. Parts NEVER enter the denorm from the shelf
(decision #25), and once installed they've already been counted via their
install log. Adding a parts pass to Recalculate would double-count, and
the fact that this pass DIDN'T need to exist is the tidiest evidence that
"one accounting path" was worth insisting on.

The cascade order for group delete is now: **logs → parts → cars → group**,
deepest first. Same reasoning as logs — the parts read rule requires the
parent car to exist, so orphaning the shelf under a deleted car makes it
unreadable and undeletable, exactly as with logs. See `CarsController.deleteCar`.

## T17 — visit-based logging is a route, not a fold-in

The single-entry `AddLog` stays as the "quick log" (fast path: type, cost,
date). The visit form lives at its own route, `/groups/:gid/cars/:cid/visits/new`
(`AddVisit`), and shares the same underlying batched-denorm code path —
`createLog` for one item, `createVisit` for many. Both write ONE batch:
N log docs + car (`totalSpend`, `spendByType`, `lastByType`, optional
odometer) + group (`spendByYear`, `spendByMonth`).

The shared draft object (`VisitDraft` in `src/model/Visit.ts`) is what AI
intake (T22) fills — see decision #21. Extending the visit form with a "Scan
receipt" button means setting the draft state; no new write path.

Same-type-twice-in-one-visit tiebreak (G-D): items in the array are processed
in order; a later item of the same type wins `lastByType`. A visit shares one
date, so date-based tiebreaks would draw — array order (what the user typed
on the form) is the most defensible choice.

The T17 batch already includes `spendByType` (car) and `spendByMonth`
(group). T20's job is the CHARTS + Recalculate extension + backfill —
the batch itself was touched once, not twice, exactly per plan.md § 1.

---

## Lessons

### Read amplification
Every listener must be bounded. An unbounded listener over a user's whole
history is the fastest way off the free tier. The notification badge caps at
100 (it only needs to count to 99), the list pages at 25, and "mark all read"
batches at 400 against Firestore's 500 limit.

### A query that doesn't mirror its read rule is rejected outright
Firestore does not filter a query down to what you may see — it refuses the
whole thing. The home list queries `memberIds array-contains <self>` because
that is exactly what the `groups` read rule allows.

### `get()` in rules is not bound by client read rules
This is what makes the join flow possible without Cloud Functions: the
`joinRequests` create rule compares the presented token against the group's
real `joinToken` via `get()`, even though the requester cannot read that
document. The token is a capability and must never appear in
`groups/{id}/public/info`.

### Rules changes are inert until deployed
`firestore.rules` in the repo is not what the project enforces. Passing the
emulator tests proves the logic; it changes nothing live. Symptom of
forgetting: `permission-denied` in the UI while every test passes.

```
firebase deploy --only firestore:rules
```

### A skipped write is worse than a failed one
A failed write surfaces as an error someone can act on. A **skipped** write
looks exactly like success. The missing join notifications were a bare
`if (ownerId)` guard around the owner's notification: when
`groups/{id}/public/info` had no `ownerId`, the join request committed happily
and nobody was ever told. Prefer writing and letting the rules refuse, or log
loudly — never skip silently. See *Notifications* below.

---

## Design

The refresh (2026-07-27) moved the app toward true minimalism. The **flow is
unchanged**; the skin is not. `src/styles/tokens.css` is the single source of
truth — the reskin landed by changing token values, not by editing screens.

- Near-white page (`--color-page`), white surfaces, **hairline borders instead
  of shadows** (`--shadow-card: none`).
- **Orange is one accent**, not a theme: primary buttons, active states, links,
  the unread/owned leading edge. Neutral grey everywhere else.
- The blurred background blobs survive at ~15% of their old alpha — the page
  should read as paper, not gradient.
- **One typeface, six sizes** (`--text-display` … `--text-label`), generous
  line-height.
- Reduced radii (card 32px → 14px), **8px spacing grid** (`--space-*`).
- **One control height** (`--control-height: 48px`) for every button and input,
  so nothing sits a few pixels off its neighbour.

### Two accent sets, one token file
The accent lives in exactly one block of `tokens.css`; a second block overrides
just that block under `:root[data-theme="mono"]`. Neutrals, status colours,
type, spacing and shape are shared, so swapping the accent is a fourteen-line
diff rather than a redesign.

| | |
|---|---|
| default | **deep teal** `#0F766E` — buttons, active states, links, focus rings, the "yours"/"unread" leading edge |
| `?theme=mono` | **near-monochrome** — near-black primaries, no accent hue at all; the only colour left is status |

`src/utils/theme.ts` stamps `data-theme` on `<html>` from `?theme=` or
localStorage **before the first render** (applying it after would flash the
wrong colours). One deployed build shows both, which is the point — they can be
compared on a real phone before either is committed to.

**Status colours are never themed**, and `--color-success` moved off emerald
when the accent became teal: emerald sits ~15° from teal-700 and the two read
as the same colour at badge size. A status colour that can be mistaken for the
accent has stopped doing its job. `tokens.contrast.test.ts` enforces both a
hue gap from the accent and WCAG AA, by parsing the real stylesheet — so a
token edit that breaks either fails there rather than on someone's phone.

That test also caught a **pre-existing** failure the refresh had shipped:
`--color-text-faint` was stone-400, 2.5:1 on white, and it was carrying real
13px text (timestamps, joined-on dates). It's darkened now. The consequence is
that the bottom two greys sit close together — 4.5:1 lands in roughly the same
place whatever hue you pick — so hierarchy below `-subtle` comes from size and
weight, not from a grey nobody can read.

### Mobile-first is a rule, not a breakpoint
Every token value is the **phone** value; one `min-width: 600px` query scales a
handful of them UP. Nothing scales down, so a 375px screen never inherits a
desktop measurement it can't afford.

- Page gutter `--page-padding`: 20px on phones, 24px above 600px.
- **Never nest a panel inside a panel.** Three stacked gutters cost ~96px of a
  375px screen before any content is drawn. The QR's white plate and the
  members rows' inner cards were both removed for this reason.
- Touch targets ≥ 44px (`--tap-min`); primary buttons full-width on mobile.
- Inputs are ≥ 16px or **iOS Safari zooms the viewport on focus and never zooms
  back out**. Enforced globally in `index.css`, not per component.
- iOS safe areas via `--safe-*`; `index.html` needs `viewport-fit=cover` for
  `env(safe-area-inset-*)` to resolve to anything but 0.
- Destructive actions never sit shoulder-to-shoulder with a benign one under a
  thumb — confirmations stack on mobile.

Verified with a real-geometry audit (`preview/audit.html`, dev-only) across all
10 screens at 375 / 390 / 430px: no element's right edge passes the viewport.
`overflow-x: hidden` on `body` is a safety net, not the fix — it would mask a
real overflow, which is why the audit measures element rectangles instead of
scroll width.

---

## Structure

### The group is three screens, not one
`/groups/:groupId` is the **cars space** — the group's front door, and what
Phase 2 fills. Members and Invitation are their own routes:

| Route | Contents |
|---|---|
| `/groups/:groupId` | Name, summary, links out, **the cars list** [C10] |
| `/groups/:groupId/members` | Member list, car-adding toggles, pending requests, delete / leave |
| `/groups/:groupId/invite` | QR, link, code — **owner-only** |
| `/groups/:groupId/cars/new` | Add a car — owner or a `canAddCars` member [C1] |

`/groups/:groupId` deliberately kept its meaning, so every invite link,
notification target and bookmark minted before the split still resolves.
Owner-only is enforced on the invite screen itself, not just by hiding the
link — the join token is a capability, and reaching the URL directly must not
reveal it.

### Renaming a group is a batch, and the names are point-in-time
The owner renames a group inline on the group screen [G12]. One batch carries
the new name **and** a `group_renamed` notification for every member except the
renamer, so the name and the announcement of it can never disagree.

Two things fall out of `get()` seeing **pre-batch** state:

- `oldName` **can** be validated — the group document still holds the old name
  while the notification's create rule runs, so the rules pin it exactly.
- `newName` **cannot** — it's the sibling write, invisible from there — so it is
  length-checked only. That grants the renamer nothing: they're the owner, and
  an owner who wants arbitrary text in front of their members can just rename
  the group to it. What the rules actually protect is that **only the owner can
  write this type, only to members, and never to themselves.**

Live displays follow their listeners, so home and the group screen update
without a reload. Delivered notifications keep the names they were written
with, deliberately: "Alex renamed Family Car to Family Cars" is a statement
about a moment, and refreshing it later would make it a lie.

The rename also re-publishes `groups/{id}/public/info` so an invitee sees the
new name — best-effort and after the commit, because a stale invite title is
not worth failing a rename that already succeeded.

### Home splits owned from joined
Two sections — "Your groups" (`ownerId == me`) and "Joined". Both are derived
on every render from the same live snapshot, so there is no second copy of the
list to keep in step. A section with no groups renders nothing at all, which is
what produces "only one section when the other is empty" without either needing
its own empty copy. Owned groups carry an accent leading edge and a badge, both
from theme tokens.

### Sign-out is never the first tap
It used to be a bare button 8px from the notification bell, and people hit it by
accident. It lives inside the account menu now (`components/app_shell/
AccountMenu`). The fix was not a confirmation on the same button — it was making
the top-level tap in that corner non-destructive. A mis-tap opens a menu.

### Loading is branded, not blank
- `Splash` while Firebase restores the session. **Routing does not happen until
  `isAuthLoading` clears** — otherwise every guard reads "signed out" and
  redirects to `/auth`, and a returning user sees the login screen flash.
- Skeleton rows (not spinners) for the groups and notification lists: both have
  a known uniform row shape, so the layout settles before data lands.

---

## Auth

### Google sign-in: popup vs redirect
Redirect is the better phone experience, but it only *works* when Firebase's
`/__/auth` handler is same-origin with the app. This project is split —
app on `car-log-project.web.app`, authDomain on `car-log-project.firebaseapp.com`
— so the handler's storage is third-party storage, which Safari, Firefox and
Chrome all block or partition. The failure is silent: the user authenticates
with Google and lands back on the login screen with no error.

`utils/authMode.ts` compares the two hosts at runtime and takes the popup while
they differ. Full explanation and the two console steps to enable redirect:
**`docs/auth-redirect.md`**.

### Notifications
`groups/{id}/public/info.ownerId` is the **only** thing that tells a non-member
who to address a join-request notification to — the group document is
members-only. `ensurePublicInfo` therefore checks *both* fields and repairs
either; checking only `name` was the root cause of the missing notifications.
The three legitimate cross-user writes are shaped by
`firestore.rules § notifications` and covered end to end in
`tests/rules/notifications.test.ts`.

---

## Cars (Phase 2)

### Car data is bundled, not fetched
`src/data/cars-my.json` ships brand → model → year with the app: no API, no key,
no network call in the add-car flow, and it works offline. It is
Malaysia-focused and deliberately not exhaustive — **"Other" takes free text**,
which is the only thing that stops a curated list becoming a wall someone
can't get past. `src/data/maintenance-types.json` does the same for L3's
presets.

### Two implicit edit-holders, and an empty map
A car's `access` map records only who has been **elevated** to edit. The
creator and the group owner hold edit implicitly and are never written into it
— putting them there would make the map a second, drift-prone source of truth
for something the document already knows. `hasCarEdit()` in `model/Car.ts` is
where that decision lives, and `firestore.rules § cars` mirrors it. A car
therefore arrives with `access: {}`, and the rules refuse any create that
doesn't.

### Counters buy shape, not causation
`groups/{gid}.carCount` (P3a) moves in the same batch as a car create. Firestore
rules evaluate each write in a batch **independently**, so the car-create rule
cannot see the counter update and vice versa — the counter rule can only check
that the value moved by exactly one and that nothing else on the group changed.
A member could bump the count without adding a car.

That is accepted, not overlooked: at family scale the cost is a wrong number in
a Phase 3 limit check. The same is true of `users/{uid}.groupsOwned` (P3b), and
more sharply — a user owns their own profile document, so they can write any
value they like there. **Both counters are advisory. Phase 3 limits built on
them are advisory too**, and anything that must actually be enforced needs a
different mechanism.

The corollary that did need care: a counter must never be the reason a real
action fails. Group deletion therefore reads the current `groupsOwned` and
writes a clamped absolute value rather than `increment(-1)`, which would go
negative against a drifted counter and take the whole delete batch down.

### Backfilling `groupsOwned` — self-heal, not a script
`tasks.md` offered a one-off script or console edits. Neither shipped. The home
screen already holds the definitive list of the user's groups, and `UserContext`
already reads the stored counter as part of the session — so the true value and
the recorded one are both in hand for free. `useSyncGroupsOwned` writes the
difference: one write, once, only when they disagree.

It fixes every user automatically, including ones who arrive later, rather than
the handful someone remembers to run a script for — and it is the same move
`ensurePublicInfo` makes for the invite window. `carCount` needs no backfill at
all: a missing field reads as zero on both the client and in the rules, which
is exactly right for a group with no cars.

### ⏱ The CarImages gate: STRIPPED (2026-07-27, T10)

**Outcome: the API is gone, and its replacement is paid. C4 is not built.**

What was checked, in about five minutes of the two-hour box:

- `api.carimagery.com` — the free, key-less endpoint plan.md assumed — **does
  not resolve**. NXDOMAIN, not a timeout. Other third-party hosts answered 200
  from the same machine in the same minute, so this was the service, not the
  network.
- `www.carimagery.com` is alive and now sells **"Unlimited car stock photo
  usage for $19.99 per month"**, with API access for subscribers only.

So the gate never reached the question it was written to answer. None of the six
test models (Perodua Myvi/Axia, Proton Saga/X50, Toyota Vios, Honda City)
resolved, because there is nothing left to resolve them. And the successor is a
**paid API**, which decision #1 forbids outright — this stopped being a
"does it work for Malaysian models?" call and became "we are not allowed to buy
this".

No replacement API was sought, deliberately. Every candidate is a third-party
dependency with a rate limit, a key to store, a licensing question about
redistributing car photography, and a plausible path to costing money later.
Own photos (C5) already cover the actual need, and they are better: a family
recognises *their* car, not a stock press shot of the same model.

**Consequences, all of them deliberate:**

- `imageUrl` does not exist. Not on the document, not in the rules whitelist,
  not in the UI. plan.md's data model lists it; it is not built, because
  nothing can populate it and an unused writable string is just somewhere to
  park junk.
- UI precedence is `photo ?? placeholder`, not `photo ?? imageUrl ??
  placeholder`.
- The T9 backfill the task asked for is moot — there was never anything to
  backfill.
- A car with no photo shows the placeholder mark, which is the same thing it
  showed before this decision. Nothing regressed; a hoped-for nicety didn't
  arrive.

If a genuinely free, licence-clean source turns up later, the hook is a single
optional field and a precedence change — but it needs its own spec item, not a
revival of C4.

### Photos live in the document, measured in characters

Firebase Storage needs the Blaze plan for new projects, so D4 puts the photo
*in* the car document as a JPEG data URL. That makes the size budget real:
Firestore documents stop at 1MB and the document holds everything else too.

The budget is stated in **characters of the data URL**, not kilobytes of JPEG,
because that string is what occupies the document and characters are what the
rules can measure. Base64 inflates by 4/3, so:

| | |
|---|---|
| client compresses to | **250,000 chars** (≈183KB of JPEG) |
| rules reject above | **350,000 chars** |

Reading "250KB" as *binary* would have put the encoded string at ~341,000
characters and left the guard about 9,000 characters of headroom — close enough
that a slightly different encoder would start bouncing legitimate photos. The
character reading leaves real margin.

The rules also check the string *starts* `data:image/jpeg;base64,`. Without
that, `photo` is a 350KB slot for arbitrary text.

`compressPhoto` steps quality down and then dimensions down until it fits, and
throws rather than returning something oversized — a refusal the user can act on
beats a write the rules will bounce. It decodes with
`imageOrientation: "from-image"`, or every portrait phone photo would be stored
sideways.

### The access grid is its own panel, and two layouts

C7 said the T6 members panel "gains its car columns". T11 didn't do that, for
two reasons that both hold:

- **A members × cars matrix cannot survive 390px.** A name column plus one
  column per car truncates the headers to nothing by the second car. The grid
  is a wide-screen shape; the phone needs a different one.
- **Two kinds of switch on one member row is the confusion worth avoiding.**
  That row already carries the group-level "can add cars to this group" toggle
  [C1]. Putting per-car edit switches beside it would sit two different grants,
  at two different scopes, in one undifferentiated strip.

So per-car access lives in its own panel, headed *Who can edit each car*, with
its own explanatory line. The members panel got simpler — identity, removal,
and the one group-wide permission — and the group-level switch's label now says
"to this group" so its scope is unmistakable next to the per-car ones.

Within that panel there are **two layouts of the same data**:

| | |
|---|---|
| grid | ≥700px **and** at most 3 cars — the shape C7 describes, fastest to read when it fits |
| accordion | everywhere else — tap a member, see their cars listed with a toggle each |

They are separate markup, not one layout restyled, which is why the choice is
made in JavaScript (`useMediaQuery`) rather than CSS: the grid has column
headers, the accordion has disclosure buttons, and rendering both to hide one
would put every toggle in the accessibility tree twice.

### Implicit edit is locked, not toggled

Owner and creator hold edit implicitly and it **cannot be revoked** [C6], so
their cells render as a locked badge rather than a switch. A control that
looked switchable would be lying about what it does — and the rules refuse to
write either of them into the map anyway, so a switch there could only ever
fail.

The same reasoning is why they are never stored in `access`: it would be a
second source of truth for something the document already knows, and it would
imply the entry could be deleted to revoke them.

Members see the panel **read-only** rather than not at all. Someone should be
able to check what they can and can't touch without asking the owner; mystery
permissions are how people conclude an app is broken.

### Orientation: strip the EXIF, keep the rotation

`canvas.toDataURL` writes a bare JPEG with no EXIF at all, so the rotation has
to be baked into the pixels or it is lost. That is the goal — strip the
metadata, keep the orientation — and T10 delegated all of it to
`createImageBitmap(file, { imageOrientation: "from-image" })`, which is one
browser-support assumption away from storing everyone's car sideways.

It now asks for `imageOrientation: "none"` and applies the rotation itself from
the EXIF tag it parses out of the file. `"none"` is the spec default, so a
browser that ignores the option behaves identically — the decode is
deterministic either way.

The remaining hazard is the opposite one: a browser that rotates anyway would
be rotated *again*, landing the photo 180° out, which is worse than the bug
being fixed. So `resolveRotation` cross-checks. A 90°/270° tag means the
display axes are swapped relative to the dimensions in the JPEG's own frame
header; if the decoded bitmap already came back swapped, the browser did the
work and nothing more is applied. Square images are the blind spot (swapped and
unswapped are identical) and mirrors/180° don't change dimensions either — both
trust the requested `"none"`.

The EXIF reader is ~60 hand-rolled lines because it needs two numbers from a
header, and a library for that would dwarf the feature. Everything it can't
parse — HEIC, PNG, a truncated file — returns "no rotation, unknown size",
which every caller treats as safe. **A malformed header must never be the
reason a photo is rejected.**

### HEIC, and the quality floor

**HEIC/HEIF** is not rejected up front. The decode tries `createImageBitmap`
(which reaches the system codecs on iOS/macOS, so an iPhone's HEIC decodes
natively), then an `<img>` element as a genuinely different code path, and only
then says "this browser can't read it" — with instructions that actually help.
iOS usually transcodes to JPEG in the photo picker anyway; this is for when it
doesn't.

**The quality ladder has a floor of 0.6.** Below that, JPEG artefacts show on
exactly what people photograph cars against — flat paintwork, sky, tarmac. When
quality alone can't reach the budget the pipeline gives up **pixels** instead,
dropping to 1080px and running the ladder again: a sharp 1080px image beats a
soft 1280px one at the same file size. The invariant is enforced by test, not
by comment.

### The odometer's audit stamp

C9 says the odometer never decreases, with an override for corrections. The
override is **not a boolean flag** — it's `odometerCorrectedAt`, and the rules
require a decreasing write to stamp it with `request.time`, while an increase
must *not* stamp it. So the field always means "this reading was corrected
downwards, then", which is worth keeping; a `didOverride: true` sitting on the
document forever would not be.

The UI turns the rules' refusal into a question: a lower reading pauses and asks
whether it's a correction before anything is written.

### What T10 opened, and what it left shut

Cars stopped being immutable. Update is `carEdit` (owner, creator, or elevated),
and pins everything that isn't a detail: `access` is the owner's alone and lands
in T11, `createdBy`/`createdAt` are history, and `totalSpend`/`lastByType`/
`statusStamp` may only move on a log write in T12. Delete is **owner-or-creator
only** — narrower than edit, because deleting a car takes its whole maintenance
history with it.

`logs` got read and delete rules *only*, and only because C8 says deleting a car
deletes its logs — a cascade that can't read or delete is theatre. Creating and
updating a log stays shut until T12 brings its shape validation and the
denormalisation batch. Firestore never cascades, so the client deletes logs
explicitly, in chunks, **before** the car: if it dies halfway, what survives is
a car with fewer logs, which is visible and fixable. The reverse order would
leave orphans nothing can reach.

### The preview harness has bitten twice the same way

The design preview stubs `firebase/firestore`. Twice now a new app import
(`increment` in T9, `deleteField` in T10) was missing from the stub, which
crashed the whole preview at module load and rendered a blank page — and the
first time, the width audit reported that blank page as **passing every check**.

Two consequences, both permanent:

- `preview/audit.html` fails a render with fewer than five nodes. A crash now
  reads BLANK instead of a table of false green.
- Adding a `firebase/firestore` import to the app means checking
  `preview/stubs/firestore.ts`. The check is mechanical: diff the app's imports
  against the stub's exports.

### Cars were immutable until T10 — deliberately
T9 shipped `allow update, delete: if false`. That wasn't an oversight: allowing
an unguarded `photo` key before S6's size guard existed would have meant
accepting a near-1MB document with nothing checking it. A car that can't be
changed is the safe thing to grow from, and T10 opened each path with its
validation attached.

## Maintenance & next-due (Phase 2)

### The T12 batch, and the third thing rules can't check

A log mutation is one batch across three documents: the log, the car's
`totalSpend` + `lastByType`, and the group's `spendByYear`. Every write path —
create, edit, delete — maintains all three, because a total that is only
correct on the happy path is a total nobody can trust.

Rules cannot verify the linkage. This is the same wall `carCount` hit in T9 and
`groupsOwned` before it: **writes in a batch are evaluated independently**, so
from the car's rule the sibling log write is invisible, and there is no
expression for "this counter moved because that document did". The enforceable
substitutes are the ones already in use — restrict *who* may move the number
(carEdit only), give it its OWN branch so it can't ride along with a photo or
an access grant, and pin every other field with `affectedKeys().hasOnly()`.
T14's Recalculate action is the repair, not the prevention.

### Next-due is READ-ONLY except for one write

T13 computes everything from `car.lastByType`, which T12 already denormalises.
**No screen reads log history to draw a badge.** The status of every car in
every group is derivable from documents the app is already holding.

`src/lib/nextDue.ts` is pure — no Firebase import, no React import — so `now`
is an argument and every threshold is testable to the day. `src/model/Due.ts`
is the only place a Firestore Timestamp becomes a Date; components never call
`.toDate()` to draw a badge.

The edges that needed deciding, and did:

- **No interval → no due item at all.** A logged service with no interval is
  history, not a schedule, and inventing a default would put dates in front of
  people that nobody chose.
- **Km needs BOTH an interval and a reading on the last service.** Otherwise
  there is nothing to add 10,000 to.
- **A car with no current odometer abstains on the km half** (`kmStatusUnknown`)
  rather than guessing. The date half still reports. "Due at 138,400 km" is a
  useful fact even when nothing can say whether you've passed it.
- **`addMonths` clamps.** 31 January + 1 month is 28 February, not 3 March —
  `setMonth` rolls over, which would report a service due days later than it is,
  wrongly and invisibly.

### One new listener, and why it's justified

`useCarsAcrossGroups` attaches one cars listener per group the user belongs to,
each `limit(50)`. It is the only new subscription in T13, and it exists because
home listens to *groups* and never to their cars — so the home strip genuinely
has nothing to derive from. N is the user's own group count.

The alternative was a due counter denormalised onto the group document, which
would have added a write path to every log mutation to keep it honest. Given
what the section above says about counters and causation, more counters was the
wrong trade.

### The dedupe is a stamp, and it lives in a pure function

`car.statusStamp` is `{ [type]: 'due_soon' | 'overdue' }` — the status each
service type was last **notified** at. OK is absence. A render whose computed
status already matches the stamp writes nothing at all, which is the entire
point: the app must not send a fresh reminder about the same overdue oil change
every time someone opens it.

Two deliberate choices:

- **Detection is pure.** `detectChanges` / `nextStamp` in `lib/nextDue.ts` take
  the items and the stamp and return what changed. The property that matters —
  *rendering the same situation twice produces nothing the second time* — is a
  unit test, not a claim about a hook.
- **The stamp is written as a whole map**, never patched key by key. A recovered
  type has to *leave* it, and one value is what the rules can validate.

Recovery clears silently. "You no longer need to do this" is not news worth a
notification, but the marker has to go or the next crossing would look like a
repeat.

### Reminders go to edit holders, not viewers

R4 as drafted said "for cars the user can view". T13 narrowed it, and the spec
records the amendment as R4a. A view-only member cannot log the service, book
the workshop, or clear the reminder — an item they can only dismiss is noise,
and in a family group where one person owns the cars, "everyone who can view"
means telling the whole household about a car they don't touch.

`isDueNotice()` checks edit on **both** ends: the sender, so a view-only member
cannot manufacture reminders for other people, and the recipient. Sender and
recipient may be the **same person**, which no other notification type in this
app allows — a car with a single edit holder is the common case, and excluding
the detector would mean nobody is ever told.

With no Cloud Functions (a hard constraint), the client that noticed is the only
thing that can write it. `useDueNotifications` is mounted by `HomePage` and
nowhere else, so one screen owns the stamp and the group and car pages render
status without racing it. The known gap: two devices opening the app in the same
second can both detect a crossing before either stamp lands, producing a
duplicate line. One round trip wide, cosmetic, left alone — a deterministic
document id would collapse the duplicate but then collide when the same car+type
crosses again next year.

### Status colour is never the accent

Amber and red come from `--color-warning` / `--color-error`, which the theme
swap does not touch. A reminder that reads as branding has stopped being a
reminder. This is why `--color-success` was moved off emerald in the accent
swap, and it's the same rule applied to a new surface.

---

## Shipping Phase 2 (T15–T16)

### A notification's target is a different screen per type

The tempting implementation is "tap → open the group", and it was what shipped
through T14. It is wrong for four of the eight types, and each is wrong
differently:

- **join_request** → the **members** screen. The owner's next move is Accept or
  Decline, and that list doesn't live on the group's front page. Sending them to
  the group means they arrive and then go looking.
- **due_soon / overdue / access_changed** → **that car**. A message that names
  one car and lands you on a list of cars has made you do the finding. This is
  what pushed `carId` into the `access_changed` payload at T15 — and into the
  rules, existence-checked like `isDueNotice`'s, because a payload field that
  becomes a URL somebody else follows is a tap target, not a display string.
- **request_declined / removed_from_group** → **nowhere**. Both are addressed to
  someone who is *not in the group*, so every destination inside it resolves to
  "Group not found" — which reads as a broken app rather than as the answer.
  They still mark themselves read, so the badge clears.

The general shape: a notification is a promise that something is actionable.
The deep link is where the action is, and "the group" is only sometimes that.

### An unknown notification type is a real state, not a defensive nicety

`toNotification` used to coerce any unrecognised `type` to `join_request`. That
is not a harmless default — it renders "Alex wants to join Family Cars" for a
document that said nothing of the sort. The alternative failure was worse:
`ICONS[item.type]` with an unknown key is `undefined`, and `<undefined />`
throws inside the render.

It reaches production the ordinary way. A tab left open across a deploy is
running the *old* bundle, and the first release to add a ninth type hands it
one. `RenderableType`'s `"unknown"` case renders the only sentence still known
to be true — "Something happened in {group}" — with a neutral bell, and still
opens the group.

### The T16 rules sweep found shape gaps, not auth gaps

Every path was correctly gated on *who*. Three were not gated on *what*:
`groups/{id}` (create and update), and `joinRequests` (create and update) had
no key whitelist, so an authorised writer could park arbitrary fields.

That matters more on a group than on the profile T8 fixed, not less: **a group
document is read by every member on a live listener**, so junk parked there is
downloaded by everyone and re-downloaded on every subsequent change. And
`joinRequests` is the only document a *non-member* writes and an owner reads —
`username` has been length-capped since T8 for exactly that reason, and an open
key set walked straight around the cap.

The implementation detail worth keeping: `hasOnlyGroupFields()` is applied
**outside** the branch list, not inside `isOwnerUpdate()`. A whitelist only some
writers must satisfy is not a whitelist, and the departing-member branch is
precisely the one it would have been forgotten on.

### Firebase Hosting headers are last-match-wins, and it was silently wrong

`firebase.json` listed `/assets/**` (immutable, one year) first and a `/**`
catch-all (`no-cache`) last. Hosting applies **every** matching entry and, for
the same header key, **the last one defined wins** — the opposite of `rewrites`,
where the first match wins. So every fingerprinted asset shipped as `no-cache`,
and every visitor re-downloaded the whole 1.35 MB bundle on every visit.

BUGS.md had recorded this as *fixed* since T8. It was configured, deployed, and
never verified — the failure mode is invisible from the app, which works
perfectly while being slow and expensive. Broad first, specific last, and check
the deployed artefact rather than the config:

```
curl -sI https://car-log-project.web.app/assets/<hashed>.js | grep -i cache
```

**The general lesson: a deploy-time setting is not done when it is written, it
is done when the live response is inspected.** The same reasoning already
applies to `firestore.rules` (*Rules changes are inert until deployed*); this is
the hosting half of the same blind spot.

### Firestore never cascades, and the bill is permanent

Deleting a group removed the group document and its `public/info` and left every
car and every log underneath it in place. BUGS.md predicted this at the end of
Phase 1 — *"when Phase 2 adds cars, a client-side delete will orphan them"* —
and T16 is where it came due.

Orphans here are not untidiness. A car document can hold a **250,000-character
photo**, and the cars rules require the group to exist and the reader to be in
its `memberIds`. Once the group is gone the car is unreadable, undeletable
through any UI, and permanent: megabytes charged against a 1 GB free tier that
nobody can ever reclaim. On a zero-cost project that is the expensive kind of
leak.

The cascade is deepest-first — logs, then cars, then the group — and the order
is load-bearing twice over. Every child's delete rule calls `groupExists()`, so
the group has to outlive them; and if the run dies partway, what survives is a
group with fewer cars, which is visible, still owned, and fixed by pressing
delete again. The reverse order strands everything with no way back in.

### A dead token is a value that can drift out of compliance unnoticed

The T16 sweep removed `--color-primary-strong` / `-dark` / `-border`,
`--control-height-sm`, `--shadow-tab` and `--shadow-fab`. `-strong` carried a
comment claiming "several stylesheets still say `-strong`" — by T16 none did.

The reason to delete rather than leave them: `tokens.contrast.test.ts` checks
the tokens that are *used*. An unused colour is a value nothing verifies and
nothing renders, sitting in the file looking authoritative, waiting for someone
to reach for it in a hurry. The same pass renamed `.blob-blue` / `.blob-orange`
to `.blob-top` / `.blob-bottom` — hue names left over from an accent set the app
no longer has, sitting on tokens that had already been renamed to roles. A class
called `orange` filled with teal is a small lie that costs somebody an afternoon
eventually.
