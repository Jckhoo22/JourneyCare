# Polish backlog

Open items carried out of the **T16 ship pass** (2026-07-27) and the
**Phase 3 T24 wrap** (2026-07-29). Nothing here blocks the Phase 2 or Phase 3
release; everything here was looked at, judged, and left on purpose.
Companion to [BUGS.md](BUGS.md), which holds what was *fixed* and what risk
is *accepted*.

Ordered by what a real family is likeliest to hit.

---

## 0 — Phase 3 triage (T24 wrap)

### AddCar tests broken by ComboField refactor (pre-existing)
`src/pages/AddCar/AddCar.test.tsx` has 6 failing tests and one layout invariant
test (`.combo-list` overflow-y: auto). Both regressions predate Phase 3 —
someone changed the brand picker from a `<select>` to a ComboField without
updating the tests, and ComboField uses `overflow-y: auto` which the
`layout.invariants.test.ts` guard catches. Neither breaks the app; the
combobox works. **Size:** small — either rewrite the tests to use combo
interactions, or reintroduce a compat `<select>` for test IDs.

### I18N3 preset labels
Maintenance-type preset names (`engine_oil` → "Engine oil") are still English
in `maintenance-types.json`. User-entered custom types render verbatim per
spec, but the presets a Malay/Chinese user picks from show English labels.
**Size:** medium — needs an i18n key per preset id + a preset render helper
that resolves against the current locale.

### Notification carName/typeLabel point-in-time
Only the sentence templates and the "due by" tail translate for
Malay/Chinese readers today. `carName` and `typeLabel` are point-in-time
strings frozen in the sender's language. See CONTEXT.md § I18N5 rendering
for the raw-params path that fixes `dueLabel`. Extending it to carName/
typeLabel would require adding raw `carId`/`typeId` to those payloads and
resolving at render — deferred as a follow-up.
**Size:** small once T24 lands (raw-params pattern already exists).

### `.app-page` / `.app-container` overflow rule (pre-existing test failure)
`src/styles/layout.invariants.test.ts` catches `.combo-list` as an offender.
It's inside a ComboField whose parent has a defined height, so it doesn't
actually create a page-level scroll container — but the guard is
whole-file, not scoped. **Size:** small — either exempt `.combo-list` by
name or verify the parent-height guarantee holds under all viewports.

### Recharts chunk is 312KB
The lazy chunk is bigger than the rest of the vendor code combined. It's
still LAZY, so the main bundle doesn't grow — but a spend page's first
render on a slow connection pays this. Alternatives: chart.js (~40KB),
hand-rolled SVG (~0KB for the three shapes we need). Deferred:
functionality first, weight second, and the deferred payload only lands
on the spend pages. **Size:** medium if replaced.

---

## 1 — Carried from Phase 1, still open

### Invite tokens never rotate
An invite link works forever. Revoking one means deleting the group.
**Why it's still open:** `joinToken` is pinned immutable on every membership
branch in the rules, so "regenerate invite" needs a new write path *and* a shape
for it that can't be smuggled into a membership change. Fine for a family;
genuinely needed before this is shared more widely.
**Size:** medium — rules + a button + emulator tests.

### Ownership can't be transferred
`ownerId` is immutable through the update rule. If an owner leaves the family,
the group has to be recreated and everyone re-invited.
**Why it's still open:** a transfer is a two-party handshake (offer, accept) or
it's a way to dump a group on someone. No Phase 2 spec item covers it.
**Size:** medium.

### No account deletion
`users/{uid}` has no delete path, and there's no flow to purge a user's
notifications or memberships. Deferred by **D2** to Phase 3 explicitly —
it needs a data-cleanup design, and the group-delete cascade built in T16 is
half of that design already.
**Size:** large.

### Notifications are never pruned
They accumulate forever. Every query is bounded (badge 100, list 25/page), so
this costs storage, not read amplification.
**Why it's still open:** a TTL needs either a Cloud Function (card required —
violates decision #1) or a client-side sweep on read, which spends writes to
save storage nobody is short of yet.
**Size:** small if done client-side; revisit when a user passes ~1,000 items.

---

## 2 — Found during the T16 sweep, judged non-blocking

### `overflow-x: hidden` on the page shells hides overflow rather than preventing it
`.app-page` and the auth shell both clip horizontally. Every Phase 2 surface was
audited for real overflow (labels truncate, amounts never wrap, `min-width: 0`
where flex needs it) and none was found — but the clip means a future regression
would be *invisible* instead of obvious.
**Suggested fix:** drop it in dev, or add a test that asserts
`scrollWidth === clientWidth` at 375px.
**Size:** small.

### The recompute and the create path disagree on same-day duplicates
Two entries of the same service type on the same day resolve differently between
`createLog` (last write wins, `>=`) and `recomputeLastService` (first in a
`date desc` scan, i.e. highest document id). T14's Recalculate settled on
"latest `createdAt` wins" and converges after one run, so the disagreement is
bounded and self-healing — but three code paths hold two opinions.
**Suggested fix:** hoist the tiebreak into `lib/spend.ts` and have all three use it.
**Size:** small.

### Bundle is ~1.35 MB raw / ~402 kB gzipped
Dominated by the Firebase SDK. The QR scanner is already lazy. Firestore and
Auth could be split so the auth screen doesn't pay for Firestore.
**Size:** medium, and it needs measuring before it's worth doing.

### Recalculate reads at most 50 cars × 10,000 log entries
Past that it aborts with an honest message rather than writing a wrong total.
Unreachable at family scale; recorded so the ceiling isn't a surprise.
**Size:** n/a unless someone hits it.

### Group delete cascades at most 50 cars per press
Matches the group screen's listener ceiling. A larger group needs deleting
twice, which is recoverable and visible, where an unbounded read is a surprise
bill.
**Size:** n/a unless someone hits it.

---

## 3 — Fine-tuning candidates for tomorrow

These are taste calls, not defects. Listed so they're not re-discovered.

- **Spend has no time filter.** Car and group totals are all-time only; the
  current-year figure exists on home alone. A "this year / all time" toggle on
  the group panel is the obvious next step — deliberately not built, because
  **D1** fixed the scope and a filter is a new spec item.
- **No spend chart anywhere.** Decided against: at family scale the question is
  "what did the tyres cost", which a number answers and a donut makes you hover
  for. Revisit only with a real request.
- **`SummaryStrip` lists every group with cars**, including ones with nothing
  due and RM 0.00 spent. Honest, and stable across renders, but a family in six
  groups would see six rows. Consider collapsing past ~4.
- **The due list's collapsed "OK" section** is a disclosure on the car page but
  has no equivalent on the group page, where `WhatsDue` shows attention items
  only. Intentional; worth a second look with real usage.
- **`AccessGrid` switches to the accordion below 700px or above 3 cars.** Both
  thresholds were picked by eye, never measured against a real family's car
  count.
- **Photo compression targets 250,000 characters** against a 350,000 rules
  guard. Nobody has yet checked what a modern iPhone photo actually lands at
  after the canvas pass — if it's routinely 80,000, the budget is generous and
  quality is being thrown away for nothing.

---

## 3b — Open after fine-tuning batch 2 (car page restructure)

- **Log search only covers the loaded page.** `useLogs` listens to 20 entries
  and `loadMore` widens the window; `matchesLog` filters what is in memory. So
  a term that matches nothing in the first 20 entries finds nothing until more
  is loaded, and on a car with years of history that is the common case rather
  than the edge one.

  Stated in the UI (`logs.searchScopeNote`, shown beside results as well as
  beside an empty result) rather than papered over, because the failure mode is
  a user concluding a service never happened.

  **Deliberately not solved, and the options are all bad at this tier.**
  Firestore has no substring or full-text matching, so a server-side search
  means either (a) a query per keystroke — the read amplification this project
  has already been bitten by, and a bill that scales with typing; (b) loading
  the entire history into memory on page open, which is the same read cost paid
  eagerly for every visitor whether they search or not; or (c) a third-party
  search index, which costs money and breaks the zero-cost constraint.

  The cheapest honest improvement, if this becomes a real complaint: a "search
  all history" button that pulls the remaining pages ON DEMAND — one bounded
  read burst, paid only by someone who asked for it. **Owner decision:** worth
  it, or is loading older enough?

- **Custom-type services all share one `lastByType` bucket.** A log's `type` is
  `"custom"` for every custom entry, with the text in `customLabel` — so
  logging "aircond compressor" and then "windscreen" makes the second overwrite
  the first as the last custom service, and any next-due tracks whichever came
  last. Pre-existing, unchanged by this batch, and the parts presets make it
  less likely to bite (thirteen things that used to need Custom now don't).
  Fixing it means slugifying the label into the type id, which changes what is
  stored — out of scope for a layout batch.

## 3m — Car form: app shell, empty-nickname model, photo actions, dirty-state save (2026-07-28) — **DONE**

UI + one data-shape correction. Same routes (`/groups/:groupId/cars/new`
and `/groups/:groupId/cars/:carId/edit`). No new rules branch, no
listener change, no new write path — every write these two screens emit
still lands in the branches the deployed suite already covers.

- **Standard in-app shell.** Both screens migrated OFF the auth-card
  (`.app-container` + `.auth-card` + `.icon-header`) and ONTO the
  Settings-style shell: `.app-page` + `TopBar` + narrow
  `.app-form-column` centered inside `.app-main`. New shared class
  `.app-form-column` in `styles/app-shell.css` at 480px max-width,
  matching Settings' body column. Titles now use `.app-h1`, empty
  states `.app-empty`, forms sit inside `.app-panel`. The Edit-car
  page subtitle ("Change what this car is. The mileage has its own
  control.") is retired — the field labels do the same job. Add-car
  keeps its one support line ("Pick it from the list, or enter it
  yourself.") because "add a car" earns one line of unambiguity for a
  first-time user.
- **Nickname is stored empty unless the user typed one.** Audited:
  neither `createCar` nor `carToFields` was auto-filling
  `"{brand} {model}"` — those paths were already honest. What DID exist
  was legacy data from earlier builds where cars carried
  `nickname: "Proton Persona"` verbatim. Self-heal added in `EditCar`:
  on save, if the stored nickname is exactly `"{brand} {model}"` AND
  the user didn't touch the field, it writes empty. `saveDetails`
  already converts empty → `deleteField()`, so this is a per-row
  migration on Edit, not a bulk sweep, and the display fallback
  (`carDisplayName` = nickname || brand+model || "Untitled car") makes
  the change invisible in every UI. **Rules check filed:**
  `firestore.rules § cars → isValidCar` requires nickname to be a
  string ≤ 40 chars **only when present** — no `.size() > 0` — so
  omission is admissible. No rules change, no deploy needed.
- **Nickname placeholder + helper.** Placeholder is `"Mum's Myvi"` (a
  real example, no `e.g.` prefix), and a small hint below reads
  `"Give it a name the family uses."` — the placeholder is what to
  type, the helper is why to bother.
- **Photo section: two controls, not three.** Retired: "Edit photo",
  "Replace photo". Kept: **Change photo** (secondary,
  `Camera` icon — opens the picker directly and runs the file through
  the existing `prepareFileForEditor` → `PhotoEditor` → 
  `compressPreparedImage` pipeline) and **Remove** (quiet
  destructive text button, red-tinted via `.car-photo-editor-remove`,
  opens the shared `ConfirmDialog` modal). Crop/adjust now happens
  INSIDE the Change flow rather than as a sibling button — one ingress
  for "make this photo different". Frame proportions realigned to the
  car page (`aspect-ratio: 2 / 1`, `max-height: 200px`,
  `object-position: center 60%`) so the preview reads as the same
  object the detail page shows. Placeholder is the lucide `Car` mark
  in the teal-tint badge, matching `CarCard` / `CarPhotoPanel`. Both
  action buttons stay ≥44px and never wrap.
- **Sentence-case form labels + no decorative icons.** Locale flipped
  from ALL CAPS to sentence case ("Brand", "Model", "Year", "Nickname",
  "Plate number", "Mileage (km)"). Divider is `"Optional details"`
  (was `"Optional"`). Removed: the leading `Car / Tag / Calendar /
  Hash / Gauge` icons inside the inputs. Scoping is via a new
  `.car-fields` wrapper class in `CarFields.css`, which overrides the
  shared `.input-label` uppercase treatment and drops the icon-inset
  padding back to the normal text gutter. **`ComboField` and
  `SelectField` gained an optional `icon` prop** (same pattern
  `AuthTextField` has always had) so the icon-less rendering is a
  plain omission, not a CSS hack. Every existing caller passes `icon`
  and is unaffected.
- **Save behavior.**
  - **Edit car** uses the Settings dirty-state pattern: the Save
    button is not rendered at all while `fields` matches the loaded
    car. A keystroke reveals it (solid teal), a revert hides it. No
    checkmark in the idle label — the button's presence IS the
    "you have something to save" signal. Photo saves are independent
    of the details form (they own `savePhoto`) and untouched.
    Success toast is now `"Car updated."` (was `"Car details
    saved."`).
  - **Add car** keeps Save always visible (there is no clean state on
    a create form). Disabled until the three required pickers
    (brand/model/year) are answered; a one-line reason below the
    disabled button (`cars.addDisabledHint`) names what's missing so
    the button never reads as a dead-end. Loading → land on the new
    car's own page (was: back to the group listing).

Retired locale keys: `cars.photoEdit`, `cars.photoReplace`,
`cars.editSubtitle`. Added: `cars.photoChange`,
`cars.addDisabledHint`. Retired CSS: the old `.add-car-hint`,
`.add-car-optional`, `.add-car-optional-label` from the auth-shell
layout — the new form column is app-shell chrome.

**Pre-existing test failures noted, not caused by this pass:** 7 tests
already failing on the parent commit —
`src/pages/AddCar/AddCar.test.tsx` (6, all `user.selectOptions` on a
`ComboField` combobox input rather than a `<select>`) and
`src/styles/layout.invariants.test.ts` (1, `.combo-list` opens a
y-axis scroll container). Both regressed with `f246545 feat(car-form):
type-to-search combobox for Brand and Model`, which didn't update the
tests. Running before and after this pass yields the identical 7-fail
signature. Fix belongs in a dedicated combobox-tests pass.

## 3l — People card: member-block hierarchy + control alignment (2026-07-28) — **DONE**

Pure presentation on the People card
(`src/components/groups/PeoplePanel.tsx` + `.css`). No routes,
schema, rules, batch shapes, or listeners touched. The
`useDebouncedToggle` clock and its coalescing rules from 3k below
are unchanged; the write shapes emitted here are the same batches
`CarsController.test.tsx` already pins.

- **Owner block is badge-only.** The two static capability lines
  ("Can add cars to this group" / "Can edit all cars") are gone —
  the Owner badge + the card's explainer sentence already carry
  the model, and the two lines were the only content in the block.
  Owner rows render no toggles, no disclosure. `peopleOwnerAddsCars`
  and `peopleOwnerEditsAll` locale strings retired.
- **Settings-list convention on member rows.** New `layout="split"`
  on `ToggleSwitch` (`flex-direction: row-reverse` + `flex: 1` on
  the label): label pushed to the LEFT with medium body text, the
  track anchors the RIGHT edge. Applied to the two per-member
  switches ("Can add cars to this group" and "Can edit all cars").
  Row height stays ≥44px (each toggle's `min-height: var(--tap-min)`),
  8px rhythm inside the perms block. The `layout="start"` default
  is unchanged, so no other caller is affected.
- **Blocks read as units.** `.people-item` padding bumped to
  `var(--space-4)` top and bottom, so consecutive rows have ~32px
  between them (spec floor 24px + a little air). The hairline
  divider stays; the seam matters at 5+ members where padding
  alone gets lost in the greys.
- **Per-car disclosure = "Per-car access ({n})".** The chevron IS
  the state — no "Show / Hide" wording sits next to it. The old
  `Customize per car / Hide per-car` state-wording and the trailing
  "on-of-total" summary chip are retired; the label stays STABLE
  so the reader isn't tracking two hints at once. Disclosure row
  also uses the settings-list split layout: label left, chevron
  right, whole row is a ≥44px tap target.
- **Remove already sat in the name row** — kept, no visual change
  needed beyond confirming the ≥44px hit area and quiet text
  treatment. `ConfirmDialog` flow is untouched.
- **Sentence-case sweep.** `.people-access-state` dropped its
  `text-transform: uppercase` + `letter-spacing: wide` inheritance
  — the read-only per-car chip reads as a status line, not a
  form-field label. No other caps remain on this file.
- **Owner meta line reads as one sentence.** "Owner · Joined 15
  Jan" — a subtle `.people-meta-dot` between badge and joined
  date, so the two chips stop floating as separate cards.

Retired locale: `peopleOwnerAddsCars`, `peopleOwnerEditsAll`,
`peopleCustomize`, `peopleCollapse`. Added:
`peopleDisclosure: "Per-car access ({count})"`. Retired CSS:
`.people-static-block` and `.people-disclosure-summary`. The
`ToggleSwitch.pending` prop from 3k stays; `layout` is the only
new prop this pass.

## 3k — Access toggles: debounced writes, coalesced feedback (2026-07-28) — **DONE**

UI + one new hook. Same route (`/groups/:groupId/members`), same
Firestore document shapes, same rules, same batch shapes — this
pass changes **WHEN** a write fires, never **WHAT** it writes.
The emulator rules suite is unchanged and untouched.

- **New: `useDebouncedToggle`** (`src/utils/useDebouncedToggle.ts`).
  Trailing 600ms debounce, optimistic local flip, in-flight lock
  during the round-trip, revert-on-failure. Every access-toggle
  wrapper in PeoplePanel uses it — per-car, "Can edit all cars"
  bulk, and "Can add cars to this group". Five unit tests cover
  the four cases the polish spec pinned (rapid-flip → one write,
  flip-back → zero writes, in-flight lock, failure revert) plus a
  listener-mirror case for the idle path.
- **Coalesce, don't stack.** Rapid flip-flip-flip inside the 600ms
  window commits **one** write with the settled value, or **zero**
  when it lands back where it started. The `access_changed`
  notification rides the same `writeBatch` as the write, so it
  dedupes automatically — the receiver's bell gains at most one
  item per settle, not one per flip.
- **In-flight lock.** During the round-trip the switch's
  `disabled=true` AND `pending=true` — the thumb pulses softly, the
  track dims, and any further onChange is ignored inside the hook.
  No queuing: the next flip must wait for the current commit to
  land. `prefers-reduced-motion` cuts the pulse.
- **Toast coalescing.** `addToast` grew a third arg
  (`{ kind?: string }`). Same-kind toasts REPLACE the existing one
  (same slot, message + timer refresh) instead of stacking. Global
  cap of 2 visible; a third eviction drops the oldest. Long
  name+car combos line-clamp at two lines so a "Granted Jie Chen
  edit for the Saga…" toast never pushes off-viewport. Four unit
  tests pin the coalesce + cap behaviour.
- **Friendly failure.** A rejected settled write reverts the
  optimistic flip and fires ONE toast:
  `locale.errors.accessToggleFailed` ("Couldn't update access. Try
  again."), with a `-error` kind per member/cell so a burst is one
  card, not five. Raw Firebase codes are still logged to the
  console for the developer.
- **Controllers now silent on the access paths.**
  `useCarAccessActions.setCarEdit`, `setCarEditBulk`, and
  `useCarAdderActions.setCarAdder` no longer `addToast` on success
  or failure — the debounced wrapper does, using its `kind` so a
  coalesced write toasts once for the settled state, never for the
  intermediates. Batch shapes, notification builders, and rules
  branches all untouched; `bulkBusyUid` still fires during the
  actual commit to freeze per-car cells for the same member.

Retired: `PeoplePanelProps.carAdderBusyUid` and
`PeoplePanelProps.busyKey` (the debounce hook owns its own pending
state per cell). `useToast` callers can still pass no `kind`, in
which case the toast stacks like before under the same 2-cap.

## 3j — Car page: one primary, guarded destructives, calmer hierarchy (2026-07-28) — **DONE**

Same route (`/groups/:groupId/cars/:carId`). Presentation + guards only.
Log-write batch, `nextDue` maths, denormalisation flow (`car.totalSpend`,
`car.lastByType`, `group.spendByYear`), and `deleteCar` cascade are all
byte-identical to what the emulator rules suite already covers — this
pass moves controls around and buys destructive taps a confirmation, not
a rule change or a new write path.

- **One primary per page.** The sticky bottom bar's "Log a service" is
  the only solid button on the CarDetail screen. Removed: the inline
  text link inside `DueList` (via retiring its `addLogAction` prop) and
  the bottom "Add" button inside `LogHistory`. `Button variant=text`
  duplicates counted the same in Auntie's eye — two candidates for the
  next tap where there should have been one.
- **Photo panel is display only.** `CarPhotoPanel` was the small
  floating pencil / camera / trash chip overlay on the frame — three
  taps deep inside the same rectangle, and easy to hit by accident on a
  phone. It is now a plain 16:9 frame (`max-height: 220px`) with just
  the image or the emoji placeholder. All photo actions — Add, Edit,
  Replace, Remove — moved to the Edit car screen behind labelled
  buttons in a new `CarPhotoEditor` component that owns the whole
  compression + `PhotoEditor` pipeline. Remove is a
  `ConfirmDialog` naming the consequence
  (`locale.cars.photoRemoveConfirm`). `savePhoto` write is unchanged.
- **`LogHistory` row grammar = type · date · cost + "Details ▾".** No
  row-level pencil or trash icon-buttons. Both Edit and Delete now
  live INSIDE the expanded Details block as labelled buttons, so a
  destructive tap always costs one intentional expand first. Delete
  still opens a `ConfirmDialog`, with a stronger prompt naming the
  service being deleted (`"Delete this {type} entry? This updates the
  car's totals and next-due dates."`). Delete handler wiring
  unchanged — same `useLogActions.deleteLog` batch that reverses
  `car.totalSpend`, `car.lastByType[type]` (or `recomputeLastService`),
  and `group.spendByYear[year]` in one commit.
- **Search only past 8 entries.** `SEARCH_THRESHOLD = 8` — below it
  the list IS the search result and the box would just be a control
  competing with the answer. Stays visible mid-search if the user has
  narrowed a longer history to fewer than 8 matches. `LogHistory`
  test fixture padded to 9 entries so the search assertions still
  exercise the feature; the `[LOGS[0]]` edge case for "too short to
  need it" still holds at length 1.
- **`DueList` empty state = "Nothing due right now"** (no full stop —
  it's a phrase inside a card, not a sentence). Collapsed "N not due
  yet ▾" section still renders when there is a mix of due and OK
  items.
- **Sentence-case labels across the page.** `.car-stat-label`,
  `.car-stats-label`, `.spend-title`, `.spend-subhead`, `.logs-title`,
  `.due-title` all dropped `text-transform: uppercase` +
  `letter-spacing: wide` + `--text-label` in favour of `--text-xs`
  medium (or `--text-sm` semibold for panel titles). Panels read as
  panels now, not form-field eyebrows.
- **Headline spend uses no-decimals formatter.** `CarStats` renders
  `formatRinggit(car.totalSpend, { noDecimals: true })` — same
  treatment Group and Home already give their totals. Per-entry rows
  in the history keep two decimal places because `RM 11.00` is real
  precision.

Deferred to the next commit (audit-gated): the **DangerZone / delete
car** rename + stronger `ConfirmDialog` copy. Audit filed —
`deleteCar` reverses `group.carCount` in the same `writeBatch` that
deletes the car doc and chunks the log deletes, but does NOT reverse
`group.spendByYear` and does NOT clean up notifications that referred
to the dead car. That's the same partial-cleanup profile as
`deleteGroup` (documented in 3i's deferred item); Fix totals repairs
the `spendByYear` drift, and stale notification deep links land on
"not found" or render neutrally. Ship the guard now, keep the current
cascade.

Retired copy inside this pass: the row-level pencil/trash icon-only
buttons and their `.logs-edit-actions` / `.logs-icon-btn` styles; the
`.due-action` slot; the `CarPhotoPanel` chip-overlay CSS and the
`useState`/`useRef`/`useEffect` chrome that supported it; the inline
`Button` row at the bottom of `LogHistory` (sticky bar owns it).

**Correction (2026-07-28):** the note above described the emoji car in
`CarPhotoPanel` (and its siblings in `CarCard` / `CarPhotoEditor`) as a
deliberate design choice — "just the image or the emoji placeholder". It
wasn't. `specs/CONTEXT.md § Body-type illustrations` pins the placeholder
chain at `photo ?? one generic lucide car icon`; the emoji was a stray
that never got swapped for the icon the spec asks for. All five sites
(these three, plus the Home + GroupDetail empty states) now render the
lucide `Car` mark in the accent-tint chip. No schema change, no
illustration set — the spec's chain of exactly one placeholder holds.

## 3i — Members page: person-centric People card, client-side bulk edit, strong delete confirm (2026-07-28) — **DONE**

Same route (`/groups/:groupId/members`). **No schema, no rules, no
Firestore write-shape change** — every write this page emits still lands
in the same rules branch the deployed suite already covers.

- **One card, one row-group per person.** `MembersPanel` +
  `AccessGrid` merged into `PeoplePanel`. Each member row now holds
  identity (name, Owner/Member badge, joined date), a group-level
  toggle, a bulk edit toggle, and a per-car disclosure — instead of
  spreading the same person across two panels.
- **"Can add cars to this group" untouched.** Same label, same
  `canAddCars` array on the group doc, same `setDoc({ canAddCars: … },
  { merge: true })` write in `useCarAdderActions.setCarAdder`, same
  `isOwnerUpdate` rules branch. Kept honestly separate from the new
  bulk toggle because they're different permissions.
- **"Can edit all cars" is a client-side batched shortcut.** New
  `useCarAccessActions.setCarEditBulk` batches N per-car `access`
  updates + N `accessChangedNotification` writes, each byte-identical
  to what the per-car switch emits. Rides `isAccessUpdate` (cars) +
  `isAccessChangedNotice` (notifications) per-write, independently.
  **No new field, no new rules branch, no new stored state.** Toggle
  state is DERIVED at render time from the loaded cars:
    - every non-implicit car ON → "on"
    - every non-implicit car OFF → "off"
    - some on some off → "mixed" (rendered off + a "Custom" hint)
    - member is an implicit holder on every car → "always" (locked
      line, no switch)
  Skips writes for cars already at the target — writing an unchanged
  flag would land as a stray "you gained/lost edit" notification for
  something that didn't move. Whole action is one commit so it lands
  or fails as a unit; well under the 500-op batch limit (`CARS_LIMIT
  = 50` → worst case 100 writes).
- **Owner rows are honest.** No interactive switches on the owner row
  anywhere — their edit-everything and add-cars rights are implicit
  and can't be revoked, so a switch would be a lie. Same rule the
  implicit per-car cell already followed.
- **Single-member state has its own shape.** When the viewer is the
  only member of the group, the card renders the owner row + a nudge
  ("When people join, you'll choose who can edit each car") + an
  Invite people link to `/groups/:groupId/invite`. No permission UI.
- **Remove: strong `ConfirmDialog` naming the group + consequence.**
  In-row `MembersPanel` confirmation replaced with a
  `ConfirmDialog`: "Remove {name} from {group}? They'll lose access
  to all its cars." Existing `useMemberActions.removeMember` handler
  untouched; the `removed_from_group` notification still fires.
- **Delete-group rename + stronger dialog.** Section title moves from
  "Danger zone" to `Delete group`. Confirm prompt now names the group
  and the whole consequence: "This deletes {name}, all its cars, and
  every log — for everyone. This can't be undone." Confirm label
  "Delete group" (was "Yes, delete"). `deleteGroup` cascade
  untouched — see the deferred item below for what it does and does
  not clean up.
- **Copy sweep.** All-caps eyebrow text removed from this page. The
  count badge styling that read as "MANAGE MEMBERS 1" is gone in
  favour of a sentence-case `People (2)` heading.

Retired: `MembersPanel.tsx/.css`, `AccessGrid.tsx/.css`, and their
tests (`AccessGrid.test.tsx`; `GroupMembers.test.tsx` was updated for
the new confirm prompt; `PeoplePanel.test.tsx` + `CarsController.test.tsx`
added, together verifying "flip bulk ON in a 2-car group = exactly 2
per-car access updates + 2 notifications, one commit").

**Deferred (not this pass):**
- **`deleteGroup` leaves stale notification items and
  `joinRequests`.** Cars, logs, `public/info` and the group doc all
  cascade (chunked at 400 ops/batch, rules-permitted). What is NOT
  cleaned up: every group member's `notifications/{uid}/items/*` that
  refers to the dead groupId (join_request, group_renamed,
  access_changed, due_soon/overdue, removed_from_group,
  request_accepted/declined), and any `joinRequests` docs for that
  group (which the rules block `delete: if false` anyway — needs a
  rules change to become permitted). These are small (envelope +
  short payload each) and cosmetic (dead deep links either 404 or
  render neutrally per `pages/Notifications.tsx handleOpen`), not the
  photo-orphan class the T16 cascade was built to prevent. Design
  alongside the account-delete cascade, which needs the same
  primitives.

## 3h — Invite panel: production origin + Share/Copy + kill pseudo-code (2026-07-28) — **DONE**

Same route (`/groups/:groupId/invite`), same token, same rules — this
changes how the invite URL is BUILT, DISPLAYED, and SHARED.

- **Production origin, not `window.location`.** The URL helper moved
  from `src/utils/inviteLink.ts` to a new `src/lib/inviteUrl.ts` and
  reads `VITE_APP_ORIGIN` (default `https://car-log-project.web.app`)
  instead of `window.location.origin`. A QR rendered on a dev laptop
  now scans correctly from a phone — the sacred `/join/:groupId/:token`
  deep link is walkable end to end from any origin the developer might
  be serving. `.env.example` documents the var. Verified: no
  invite-facing site reads `location.origin` any more (auth-email URL
  in `AuthController.ts` still does, correctly — different domain).
- **"OR ENTER THIS CODE" is gone.** The chunked hex token was never a
  code anyone reasonably typed (32 characters of `[0-9a-f]`), and the
  link covers the no-camera case. Section removed; the
  `buildInviteCode` and `formatCodeForDisplay` helpers deleted along
  with their tests. `parseInvite` still accepts the legacy
  `<groupId>/<token>` shape in case someone pasted one from an old
  copy button — one test pins that.
- **Share / Copy actions via primitives.** Mobile
  (`navigator.share` available): a solid teal `<Button icon={Share2}>`
  "Share link" primary that opens the OS share sheet with the group
  name in the title (`"Join {group} on Journey Care"`), with a
  secondary `<Button icon={Copy}>` beside it. Desktop
  (no `navigator.share`): solid `<Button icon={Copy}>` is the primary
  and only action. Copy's success state swaps to `<Check>` + "Copied"
  for ~2s (R9). Cancelled shares (AbortError) don't toast. R1 holds:
  exactly one solid teal button per variant.
- **Display cleanup.** The URL now renders as
  `car-log-project.web.app/join/…` in muted mono — a
  `displayInviteUrl` helper strips the scheme and ellipsises the
  path. The full URL is what the Share / Copy actions carry
  (and a `title` attribute exposes it on desktop hover). The
  `INVITE LINK` caps eyebrow drops to sentence-case `Invite link`.
  QR stays at 288px (≥240 polish floor).

Retired: `join.inviteCodeLabel`, `join.copyCode` locale keys; the old
`.invite-row`, `.invite-code`, `.invite-copy` (icon-only button) CSS
classes. Added `join.shareLink`, `join.shareTitle`, `join.copyLinkDone`.

## 3g — Manage group: hierarchy + row grammar + guarded Fix totals (2026-07-28) — **DONE**

UI + one interaction guard. Same route. No rules, no schema, no changes
to rename/invite/members/requests/recalc LOGIC.

- **One heading.** `PageTitle "Manage group"` is the only h1 on the
  page; the duplicated `<h1>Surewin Family</h1>` and its pencil-icon
  rename trigger came out. The group name re-enters as the BackLink
  label and as the CURRENT-name subtitle inside the Group name admin
  row below.
- **PendingRequests card stays first** and always renders (empty state
  included) — the pending banner on GroupDetail deep-links here, so the
  card is the spatial anchor. Empty copy is `"No one's waiting to join"`
  (was `"No one is waiting right now."`). Approve / Decline are labeled
  solid-teal / outline buttons; `locale.join.accept` is now `"Approve"`.
  The batched-write accept flow inside `useRequestDecisions` is
  untouched.
- **One uniform admin card** replaces the previous separate Members /
  Invitation cards AND the group-name heading. Rows share the icon +
  verb-first title + subtitle + right-side affordance grammar,
  separated by hairline dividers, each ≥56px. Order: Invite people →
  Members → Group name. Invite and Members are whole-row `<Link>`s
  ending in a chevron; Group name is a static row whose right side is a
  small text Rename button (owners only). Invite row is owner-only,
  matching the destination screen's own permission.
- **Rename mechanism preserved.** `GroupNameEditor` was refactored to
  be the form only (its old h1+pencil display is gone) and now takes an
  `onClose` prop. Opening it is the parent's job: the Rename button
  toggles state that mounts the form as its own panel below the admin
  card. The rename write logic and the `group_renamed` notification
  fan-out inside `useRenameGroup` are untouched.
- **Fix totals demoted.** The `.manage-fix` card is gone; a muted
  centered text link (`"Numbers look wrong? Fix totals"`) sits at the
  very bottom, owner-only. Clicking it swaps the link for a
  ConfirmDialog (`spend.recalculateConfirmTitle` / `Body`); the
  recalculate call fires only from Confirm. While running: the link
  disables (belt) and the dialog's confirm goes to `"Fixing…"`
  (suspenders), so a double-tap at either layer is a no-op. The
  recalculate function itself (`useRecalculateSpend`) is unchanged —
  its own detailed toast (numbers of cars, entries, corrected) still
  fires as the outcome message.

Read cost is unchanged: `usePendingRequests` is still the only new
subscription this screen adds, still owner-only.

Retired: `.group-name-row` and `.group-name-edit` CSS (the h1+pencil is
gone), and `.manage-fix-head` / `.manage-fix-title` / `.manage-fix-body`
(the demoted Fix totals card).

## 3f — Join page: platform-adaptive single page (2026-07-28) — **DONE**

UI only. No routes, no rules, no schema, no new listeners.

- **Two variants of the same page.** `canScan` decides at render which
  of two UIs `/groups/join` shows. `getUserMedia` alone isn't enough —
  laptops have webcams but nobody scans a QR with a laptop lid — so
  the check is `hasCamera() && (matchMedia('(pointer: coarse)') ||
  width < 768px)`. Everything else (desktop, docked tablet on a mouse)
  falls to paste-only.
    - **canScan (phone)**: SOLID scan button as the primary. Under it,
      a quiet teal text link "Have a link instead?" — the paste form
      is collapsed by default so the screen reads as one obvious next
      step. Opening the paste form swaps the variants: Continue
      becomes SOLID and Scan demotes to outline, so exactly one solid
      button sits on the screen at any time (R1).
    - **!canScan (desktop, laptop, docked tablet)**: paste form IS the
      page — no scan section, no disclosure, no "or" divider. Under
      the Continue button, a subdued support line
      ("On your phone? Just point your camera at the QR code") names
      the phone-only path the desktop can't offer.
- **Paste-friendly input.** The invite field is `inputMode="url"`,
  `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`
  — a pasted URL shouldn't be title-cased, spell-checked, or "helpfully"
  mangled. Placeholder is a real example
  (`car-log-project.web.app/join/…`) instead of another restatement of
  the instruction. Font-size ≥16px is already the global floor
  (index.css, guarded by `layout.invariants.test.ts`).
- **Doubled labels killed.** The old all-caps "INVITE LINK OR CODE"
  section header + "Paste the link or code" placeholder became a
  single readable label ("Paste the invite link") + a real-example
  placeholder. Error copy is now a plain sentence
  ("That link doesn't look right. Check it and try again"), never a
  raw error code.
- **BackLink is now PAGE-LEVEL, top-left**, absolutely positioned above
  the centred card. Same top-left placement every signed-in detail page
  uses; the auth-card itself carries only icon → title → form. The
  earlier iteration's `.join-code-back-top` wrapper (BackLink inside
  the card, above the icon) is retired in favour of `.join-page-back`,
  which sits outside `.auth-card` and clears the safe-area inset.
- **Sentence-case field label.** The invite field's label reads
  "Paste the invite link" rather than the auth-shell default of
  screaming caps. Scoped to `.join-form .input-label` so LoginRegister,
  Settings, and every other AuthTextField caller keeps its all-caps
  eyebrow. Field switched to the `TextField` primitive from
  `components/ui` (the same re-export path Settings uses).
- **Desktop card dressing.** From 600px up, the card widens 420 →
  460px, splits its padding as 40px top / 32px sides / 32px bottom
  (a form settles better with more air above), and sits in the upper
  third of the viewport (`align-items: flex-start` + `padding-top`
  `max(24px, 15dvh)`) — dead-centre on a 1080p screen reads as
  floating. Mobile shape is untouched: the shared `.auth-card` still
  owns the phone card.
- **Support-line copy + orphan guard.** Now "On your phone? Just
  scan the QR code with your camera". `text-wrap: balance` and a
  32-ch max-width keep the sentence from orphaning a single word on
  the last line regardless of viewport width.
- **Header icon → UserPlus.** Device-neutral, matches the page's
  actual meaning on both variants. `LogIn` came from the pre-adaptive
  era; `ScanLine` would have been wrong on the desktop variant.
- **Retired locale keys.** `entryBody`, `entryBodyPhone`,
  `entryBodyDesktop`, `orDivider`, `scanUnavailable`, `scanInsecure`,
  `nativeCameraTip`, `pasteToggleShow`, `pasteToggleHide`. Retired CSS:
  `.join-divider*`, `.join-code-hint`, `.join-native-tip`,
  `.join-paste-fallback`, `.join-paste-toggle*`, `.join-code-footer`,
  `.join-code-back-top` (the inside-card back-link wrapper from the
  previous iteration).

Primitives are the only chrome on this page: `<Button>` for the CTAs
and the quiet "Have a link instead?" link, `<TextField>` from
`components/ui` for paste (extended with `autoCapitalize`/`autoCorrect`/
`spellCheck` optional props so other callers are unaffected),
`<BackLink>` for back, `.icon-box`/`.title`/`.subtitle`/`.auth-card`
from the shared auth-shell. Zero changes to the join logic files
(`utils/inviteLink.ts`, `controller/JoinController.ts`, the
`/join/:groupId/:token` deep link page, `components/qr/QrScanner`).

## 3e — Group page polish (2026-07-28) — **DONE**

UI only. No routes, no rules, no schema.

- **Manage: bottom card → title-row button, owner-only.** The old
  full-width "Manage group" card that closed the page is gone; owners
  now see a quiet secondary button (`.group-manage-btn`, ~36px,
  bordered) beside the group name. Members render no Manage entry point
  on this page at all — the title row lays out normally with no reserved
  gap. The page ends on Spending. See
  `src/pages/GroupDetail/GroupDetail.tsx` + `.css`.
- **Pending join requests are a banner, not a badge.** For an owner with
  ≥1 pending request, an amber banner (`.group-pending-banner`, warning
  tokens, UserPlus icon, "N person(s) waiting to join", Review action)
  sits above What's due and links to `/manage`. The Manage button also
  carries a small amber dot as a belt to the banner's suspenders.
  **Listener count is net zero**: the group page already ran
  `usePendingRequests` for the old badge, so the banner reuses the same
  subscription rather than adding one.
- **CarCard cleanups.** (a) `carSubtitle` in `src/model/Car.ts` drops
  the "brand model" half when it would just restate the display name
  (e.g. a nickname that equals the model). The distinct-nickname case
  is unchanged. (b) The plate is plain muted monospace text, not a
  bordered pill — pill/badge styling is reserved for status colours
  only. (c) A new one-line status line on every car card: a
  status-coloured dot plus one sentence from `dueForCar(car)` (already-
  loaded `lastByType`, no new reads), "Up to date" /
  "{type} due soon" / "{type} overdue", nearest attention item only.
- **Spend polish.** `formatRinggit` in `src/utils/money.ts` grew a
  `noDecimals` option (opt-in, not default) so headline figures read
  "RM 1,011" while columnar per-car rows still read "RM 500.50". The
  group page's headline uses it; per-car rows do not. And a one-car
  group's per-car row is suppressed — it would only repeat the
  headline. Two-plus cars keep the split.
- **What's-due empty text.** "Nothing due across these cars." → "All
  cars are up to date" (no trailing period), matching the Home strip so
  both surfaces read the same when everything is settled.

The `manageEntryHintOwner` / `manageEntryHintMember` / `managePendingOne`
/ `managePendingMany` strings and the old `.group-manage-link` /
`.group-manage-icon` / `.group-manage-body` / `.group-manage-title` /
`.group-manage-hint` / `.group-manage-badge` / `.group-manage-chevron`
classes went with the bottom card. CarCard grew `.car-card-status`,
`.car-card-status-dot`, `.car-card-status-text` plus status modifiers.

## 3d — Home page: status card + bordered actions (2026-07-28) — **DONE**

- **Create / Join → bordered buttons.** The two text links at the bottom
  of Home are now `<Button variant="secondary">` in a side-by-side row.
  "Create group" carries an accent-tinted border (teal edge + teal text)
  to hint at the default next step; "Join group" is neutral. NEITHER
  is filled — the group cards remain the primary tap target. R1: zero
  solid primary buttons on Home.
- **SummaryStrip → two-zone card.** Zone A is a status headline: a round
  status-tinted chip (36px) + "Nothing due" / "N overdue" / "N due soon"
  + a support line ("All cars are up to date" or "Engine oil · Mum's
  Myvi"). Zone B is the spend figure: single-group users see one row
  (label + RM); multi-group users see per-group rows under one "Spent
  this year" caption. Hairline divides the two zones. The year label
  dropped its explicit year — "Spent this year" is enough context.
- **Greeting trimmed** from `--text-display` (28px display face) to
  20px/medium so the status card sits above the fold on a 390px screen.
- **Group cards** are already fully tappable via `<Link>` — verified,
  no change needed.

Read-amplification stayed at zero: the nearest-attention support line
is derived from the `carsByGroup` map Home already holds. Listener
count unchanged (16 → 16).

## 3c — Header + back-link polish (2026-07-28) — **DONE**

Both items shipped in the same commit; the "before" is the old bare-arrow +
Home-only-via-menu state.

- **Clickable logo/title → Home.** `TopBar` wraps the mark AND the "Journey
  Care" name in a single `<Link to="/">` — no dead gap between icon and text.
  `aria-label="Journey Care — home"` (from `locale.common.homeLinkAria`), a
  subtle opacity hover, no colour flip, no confirmation dialog even from
  form pages. See `src/components/app_shell/TopBar.tsx` + `.css`.
- **Destination-labelled back links.** New shared `<BackLink to label />`
  in `src/components/BackLink.tsx` replaces every ad-hoc back button (six
  app-shell pages, six auth-shell forms). Label is the parent's actual name
  (group name, car name, or "Home") rather than "Back to X"; truncates at
  20 chars so it never wraps on a 390px screen. Uses explicit `Link to`,
  not `navigate(-1)` — the /join deep link and shared URLs have no
  meaningful history, and popping it would eject the user. Teal accent,
  ≥44px tap target, `"Back"` fallback while the parent's own name is still
  loading (no new Firestore read).

The old `.app-back` / `.auth-footer-link` / `.join-back` /
`.create-group-back` / `.join-code-back` classes are gone; only their
wrappers survive.

## 4 — Needs an owner decision before it can be written down

Two items were requested for the CONTEXT.md decision log that **do not exist in
the codebase**, so no entry was invented for them:

- **Body-type illustrations.** The car image slot is `photo ?? placeholder`, and
  the placeholder is a single generic `lucide` car icon — the same mark for a
  Myvi and a Hilux. There is no body-type variation anywhere in `src/`.
- **Bulk access.** `AccessGrid` toggles one member × one car per switch. There
  is no select-all, no per-row bulk, no multi-select.

Either they were considered and dropped, or they're wanted and unbuilt. Say
which and both the decision log and this file can be closed out.
