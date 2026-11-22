# Phase 2 Tasks — Build Order (T9–T16)

Continue Phase 1's rhythm: each task testable before the next; rules + emulator tests are part of done; deploy rules with every rules change; update CONTEXT.md status at each task completion.

## T9 — Static data + car creation [C1–C3, P3a] ✅ DONE
- [x] src/data/cars-my.json (MY brands/models/years + "Other") and maintenance-types.json (L3 presets). Typed front door: `model/CarCatalogue.ts`.
- [x] Add-car flow from the group page: brand→model→year pickers, nickname/plate/odometer optional fields. Permission: owner or canAddCars member. Route `/groups/:groupId/cars/new`.
- [x] canAddCars management: owner toggles per member in the Members panel.
- [x] carCount on groups, batch-maintained; users.groupsOwned wired on group create/delete.
  - **Deviation:** no backfill script. `useSyncGroupsOwned` reconciles the counter from the groups the home screen already has loaded — one write, once, only when it disagrees. It needs no admin credentials and fixes every user, not just the ones a script is run for. `carCount` needs no backfill at all: a missing field reads as zero on both the client and in the rules. Rationale in `specs/CONTEXT.md § Backfilling groupsOwned`.
- [x] Rules: car create/read per plan; emulator tests incl. attack cases (27 new; 160 total green). **DEPLOY RULES — still owed.**
- [x] Group page cars grid replaces the "Cars arrive soon" placeholder.
- [x] Not in the task list, found on the way: `AuthTextField`'s label was never tied to its input (`htmlFor`/`id`), so every form in the app announced an unlabelled field to a screen reader. Fixed there and in the new `SelectField`.

## T10 — Car page, odometer, images & photos [C4, C5, C9, C10] ✅ DONE
- [x] Car detail page at `/groups/:groupId/cars/:carId`: photo header, details, edit (carEdit holders, own route reusing the add-car pickers), delete (owner/creator, confirm, client-side cascade of logs + carCount decrement).
- [x] Odometer quick-update with monotonic guard + override confirm. The override is an `odometerCorrectedAt` server stamp the rules require on a decrease and forbid on an increase — an audit trail, not a throwaway boolean.
- [x] ⏱ **CarImages GATE: STRIPPED.** `api.carimagery.com` no longer resolves (NXDOMAIN, verified against working third-party hosts); `carimagery.com` now sells access at $19.99/month, subscribers only. A paid API violates decision #1, so this stopped being a "do MY models resolve?" question. **C4 is not built**, `imageUrl` does not exist on the document or in the rules, precedence is `photo ?? placeholder`, and the T9 backfill is moot. Reasoning in `specs/CONTEXT.md § the CarImages gate`. No replacement API was sought — deliberately, per the timebox.
- [x] Own photo: capture/upload → canvas compress → `car.photo`. Budget is **250,000 characters of data URL** (client) against a **350,000-character** rules guard, plus a `data:image/jpeg;base64,` prefix check — see CONTEXT.md for why characters, not kilobytes. **DEPLOY RULES — still owed.**
- [x] `logs` gained read + delete rules only, so the C8 cascade is real rather than theatre. create/update stay shut until T12.

## T11 — Access grid [C6, C7, N6] ✅ DONE
- [x] Per-car edit toggles, owner-only writes with the field-level `diff().affectedKeys()` check — the access map is the ONLY key that branch may touch.
  - **Deviation:** not folded into the members panel. A members × cars matrix can't survive 390px, and two kinds of switch on one member row (group-level "can add cars" vs per-car edit) is the confusion worth avoiding. Per-car access got its own panel — **grid** on ≥700px with ≤3 cars, **accordion** everywhere else. Rationale in `specs/CONTEXT.md § The access grid is its own panel`.
  - Owner and each car's creator render as locked "Always" badges, not switches: their edit is implicit and can't be revoked [C6], and the rules refuse to write them into the map at all.
  - Members see the panel read-only — transparency, no mystery permissions.
- [x] access_changed notifications (N6) batched with the toggle. One type, `granted: bool` carrying the direction.
- [x] Emulator tests: non-owner toggling DENIED (creator included); owner toggle + notification batch ALLOWED; a granted member can immediately edit; a revoked member's next write bounces. 232 rules tests green. **DEPLOY RULES — still owed.**
- [x] T9's canAddCars toggles verified alongside: separate panel, and the label now reads "Can add cars to this group" so its scope is unmistakable.

## T12 — Maintenance logs [L1–L6] ✅ done & deployed
- [x] Add-log form (type picker w/ presets+custom, cost, date<=today, odometer, interval editor prefilled per L4, notes).
- [x] Log history on car page (newest first, createdBy username).
- [x] Edit/delete entries (carEdit); lastByType + totalSpend + spendByYear updated in every log batch; recompute lastByType on edit/delete of the latest entry.
- [x] Rules per plan + attack tests (no-edit member denied, forged createdBy denied, dishonest counters denied). Rules deployed; counter math verified by hand.

## T13 — Next-due [R1–R4] ✅ done & deployed
- [x] `src/lib/nextDue.ts` + 45-test vitest suite. Pure — no Firebase, no React — so every boundary is exact: no interval at all, months only, km only, whichever-comes-first, a car with no current odometer (the km half abstains rather than guessing), a service logged today, the 30-day / 1,000 km thresholds either side, and 31 Jan + 1 month clamping to 28 Feb instead of rolling into March.
- [x] `src/model/Due.ts` is the only place Timestamps become Dates — the lib stays pure and no component reaches for `.toDate()` to draw a badge.
- [x] Surfacing, all from `lastByType`: `DueBadge` on the car card [C10], `DueList` on the car page (attention items open, OK items collapsed), `WhatsDue` on the group page, `DueStrip` in home's reserved H6 slot. **No log-history reads anywhere.** The one new subscription is `useCarsAcrossGroups` — one cars listener per group the user is already in, each `limit(50)`, needed because home listens to groups and not to their cars.
- [x] Status colour comes from the status tokens (`--color-warning`, `--color-error`), never the accent — a reminder that reads as branding has stopped reminding. Theme-swap safe.
- [x] due_soon / overdue notifications with `statusStamp` dedupe, notifications + stamp in ONE batch. See R4a–R4c in spec.md: edit holders rather than viewers, and why.
- [x] Rules: `isStatusStampUpdate()` (its own narrow branch on cars — the stamp can carry nothing else) and `isDueNotice()` (edit on both ends). 29 new emulator tests; 293 rules tests green.
- [x] The dedupe is unit-tested where it actually lives: re-rendering an already-stamped status produces zero transitions and zero clears.
- [x] **RULES DEPLOYED.** Dedupe verified live — reopening the app produces no duplicate notifications.

## T14 — Spend dashboard [S1–S3] ✅ built — NO RULES DEPLOY NEEDED
- [x] Car page: `car.totalSpend` as the headline, by-type breakdown summed from the history `LogHistory` has already loaded — no new reads. The two have different provenance (a lifetime counter vs one page of history), so when they can't agree the panel SAYS so rather than letting the columns quietly fail to add up.
- [x] Group page: all-time total summed from the cars listener the page already holds, plus per-car rows biggest-first, each linking to its car. A group with nothing logged gets one sentence instead of a column of RM 0.00.
- [x] Home: per-group current-year spend woven into T13's strip rather than stacked under it. `DueStrip` → **`SummaryStrip`** (`components/summary/`), one line per group carrying both the due count and the year's spend. The money half costs nothing — `group.spendByYear` is on documents home already listens to.
  - **Year boundary [D1]:** the year is read at render. On 1 Jan the lookup asks for a bucket nobody has written and gets RM 0.00; the first log of the new year creates the key through T12's existing batch. Nothing rolls over, so nothing can roll over wrongly. Unit-tested in `lib/spend.test.ts` and `SummaryStrip.test.tsx`.
- [x] Owner "Recalculate totals": tucked behind a menu, then behind its own explanation. Reads every log in the group in bounded pages, recomputes `totalSpend` + `lastByType` + `spendByYear`, writes ONLY the documents that disagree, and reports "recalculated N cars and M entries". A healthy group produces zero writes and says "everything already agreed" — which is what makes running it a way to VERIFY the counters, not just overwrite them.
- [x] One RM formatter for the whole app: `utils/money.ts` (`formatRinggit`, `toMoney`), moved off `model/Log.ts` because T14 renders money on three screens that aren't log concerns. T12's history list now uses it too.
- [x] **Rules: no change was needed, and that is a finding rather than an oversight.** The car recalc rides `isLogDenormalisation` and the group recalc rides the owner metadata branch — both were already open, because neither branch ever could tell a log-accompanied counter change from a standalone one (a batch's writes are evaluated independently). 21 new emulator tests pin the path AND re-assert that it widened nothing; 330 rules tests green against the unmodified rules. The comments in `firestore.rules` now record the coupling so a future tightening can't break the repair silently.
  - Consequence worth stating: Recalculate being owner-only is a **product decision about a heavy read, not a security boundary**. Any edit holder can already move these counters — they must be able to, because logging a service does exactly that.

## T15 — Notification polish [N6, N7] ✅ done & deployed
- [x] All eight types audited end-to-end: copy renders as sentences about people and things, with a test asserting **no raw document id reaches the screen**.
- [x] Deep links corrected — the tap target is a different screen per type, and "the group" was wrong for four of them:
  - `join_request` → the **members** screen, where Accept and Decline live (was: group page, leaving the owner to go looking).
  - `access_changed` → **that car**. Required adding `carId` to the payload and to the rules, existence-checked like `isDueNotice`'s — a payload field that becomes a URL somebody follows is a tap target, not a display string.
  - `request_declined` → **nowhere** (was: the group page, which resolves to "not found" for someone who isn't in it — reads as a broken app rather than as the answer). Still marks read, so the badge clears.
  - `due_soon` / `overdue` → that car, unchanged. `removed_from_group` → nowhere, unchanged.
- [x] Graceful degradation: an **unrecognised type** no longer coerces to `join_request` (which put words in someone's mouth) nor throws on the icon lookup. `RenderableType`'s `"unknown"` renders a neutral sentence and still opens the group — the state a tab left open across a deploy actually reaches.
- [x] Deleted targets land on the existing not-found states in GroupDetail / CarDetail / GroupMembers. Deliberately not pre-checked: that would cost a read per tap to pre-empt a screen that already exists.
- [x] Badge verified with the full type set: unread math over mixed types, exact to 99, **99+ past it**, and the listener bound (100) asserted alongside the formatter — a future change raising one without the other would put "100" in a 2-character badge. List pagination bound tested at exactly a full page and one short.
- [x] Rules whitelist exactly the eight types with per-type payload shapes. **Rules deployed.**

## T16 — Hardening, deploy, family v2 ✅ SHIPPED
- [x] **Full rules audit, both phases.** Walked all 12 collection paths the app touches against the rule set. Every path matched; everything else falls to the explicit `match /{document=**} { allow read, write: if false }`. Found **three shape gaps** — paths correctly gated on *who* but not on *what*:
  - `groups/{id}` create + update had no key whitelist. Worse on a group than on the profile T8 fixed: a group is read by *every member* on a live listener, so junk parked there is downloaded by everyone. `hasOnlyGroupFields()`, applied **outside** the branch list so the departing-member path can't skip it.
  - `joinRequests` create + update likewise — the only document a non-member writes and an owner reads, which is why `username` was already capped. An open key set walked around the cap.
- [x] **318 emulator tests green** across 8 files (cars 68, groups 58, notifications 56, joinRequests 41, logs 30, due 29, spend 16, users 20).
- [x] **Edge sweep:** car deleted mid-view degrades to not-found rather than throwing; log form on a car with no odometer (no zero prefill, saves without one, still offers to set the first reading); a zero-log car handled on all three surfaces at once (due says what to do, history offers the first entry, spend renders *nothing*); access revoked live takes the controls away on the next snapshot rather than waiting for a write to bounce; the join deep-link gauntlet re-run intact.
- [x] **Mobile pass:** every Phase 2 surface audited at 375/390/430. Global 16px input floor confirmed (`index.css` — below it iOS zooms and never zooms back); every interactive element carries `--tap-min` or `--control-height`; labels truncate while amounts never wrap; no fixed widths; `AccessGrid` can't reach its grid layout below 700px.
- [x] **BUGS.md + POLISH.md triaged** — every Phase 1 deferral re-judged, nothing dropped. Two closed as done (group rename, per-car access), one **fixed** (below), the rest moved to `POLISH.md` with sizing.
- [x] **Group delete now cascades.** BUGS.md predicted this at the end of Phase 1; it came due here. Deleting a group orphaned every car and log under it — and an orphaned car can hold a 250,000-character photo that the rules then make unreadable *and* undeletable by anyone, permanently, against a 1GB free tier. Cascade is deepest-first because every child's delete rule calls `groupExists()`.
- [x] **Hosting cache headers were silently broken.** `/assets/**` (immutable) was listed *before* the `/**` catch-all (`no-cache`), and Firebase Hosting is **last-match-wins for headers** — the opposite of rewrites. Every fingerprinted asset shipped as `no-cache`, so every visitor re-downloaded the whole bundle. BUGS.md had it recorded as fixed since T8: configured, deployed, never verified.
- [x] **Dead code:** six unreferenced design tokens removed from both accent sets; `.blob-blue` / `.blob-orange` renamed to `.blob-top` / `.blob-bottom` (hue names on tokens already renamed to roles). No `console.log`, no TODOs, no CarImages remnants beyond the explanatory comments.
- [x] **Gates:** 372 vitest ✅ · 318 rules ✅ · lint ✅ · typecheck ✅ · build ✅
- [x] **Deployed** — hosting + rules + indexes to `car-log-project`. Live at https://car-log-project.web.app, verified: SPA rewrite serves deep routes, assets immutable, HTML `no-cache`, deployed bundle hash matches the local build.
- [x] CONTEXT.md updated: Phase 2 COMPLETE, the D1–D5 decision log as-built, the CarImages outcome, body-type illustrations and bulk access recorded as considered-and-dropped, and the T15/T16 lessons.
- [ ] **Owner still to do:** signed-in smoke on a real phone (add a log, watch the totals and due status move, confirm the notification arrives) and the family announcement. Neither can be done from here — see the note in the T16 handoff.

## Done means
C1–C10, L1–L6, R1–R4, S1–S3, SET1–2, N6–N7 live on the deployed site, rules emulator-tested, counters honest, mobile-clean.

⚠️ **This line said "✅ met" and was wrong about SET1–2.** No Settings screen
was ever built in Phase 2 — no route, no page, no entry point, and
`ChooseUsername` remained the only writer of `users/{uid}.username` in the app.
The gap surfaced as a user-reported bug ("username not editable") in the first
fine-tuning batch on 2026-07-27 and was closed there; see BUGS.md #17.

Everything else on that list *was* shipped. The lesson worth keeping is that a
checklist item ticked in the same pass that writes the checklist proves
nothing — SET1–2 had no task of its own in T9–T16, so nothing was ever
implemented for the summary line to summarise. **A spec item with no task is
the failure mode to look for**, not a task that fails.
