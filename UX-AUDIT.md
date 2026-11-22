# UX audit — first-time-family-member simplification pass

**Persona held throughout:** Auntie, 55, WhatsApp + online banking on a
phone, will use this app twice a month for two minutes, never reads
tooltips, never hovers, abandons after ~5 visible form fields, and will
not guess what an icon means.

**Method:** every route walked top to bottom, plus shared chrome and every
dialog/sheet. Each screen scored against R1–R10 from the prompt.
Severities: **blocker** = Auntie stalls or bounces; **friction** = she
completes it slower, wrong, or annoyed; **cosmetic** = she notices but
proceeds.

**Status:** Phase 0 complete. No code changed. Awaiting review before
Phase 1.

---

## Cross-cutting findings (fix systemically in Phase 1, then apply)

Ranked by breadth of impact.

### CC1 — Icon-only buttons on user-facing screens (R2 blocker)

Auntie won't know what these do. Every one of them has an aria-label —
which is invisible.

| Where | Icon-only buttons |
|---|---|
| `LogHistory` per-row | Pencil (edit log), Trash2 (delete log) |
| `MembersPanel` per-row (owner view) | Trash2 (remove member) |
| `InvitePanel` | Copy icons on link + code fields |
| `CarPhotoPanel` chip (filled) | Pencil (Edit), Camera (Replace), Trash2 (Remove) — 3 icons in a translucent pill |
| `PendingRequests` per-row | Check + X have text labels — **OK** |
| `AccountMenu` avatar | Single letter — accepted; menu underneath is labelled |
| `TopBar` bell | Icon-only; label via aria only |

**Fix:** icon + text everywhere on user screens. Owner-only surfaces
(`PendingRequests`, `InvitePanel`) may keep compact icon buttons **only**
if paired with a visible text label. Photo chip: keep the Edit-only-icon
in the corner is defensible on a photo, but the Remove-photo needs a
label (already gets one during confirm; make it the label on first tap
too). **Severity: blocker.**

### CC2 — "Odometer" everywhere (R6 friction)

`odometerTitle`, `odometerLabel`, `odometerNone`, `odometerSaved`,
`odometerCorrectedOn`, `odometerLowerTitle`, `odometerPlaceholder`,
`odometerHint`, `odometerUpdate`, `odometerSave`, `odometerCancel`,
`bumpOdometer`. Plus `Odometer` in `logs.odometerLabel: "ODOMETER AT
SERVICE (KM)"` and `cars.odometerHint`.

**Fix:** glossary swap → **"Mileage (km)"** everywhere Auntie sees. Keep
the code field names — this is a locale-only change. **Severity:
friction, high frequency.**

### CC3 — "Members" is fine, but "Access", "Interval" and "Recalculate" leak (R6 friction)

- `accessTitle: "Who can edit each car"` — already plain. **OK.**
- `intervalTitle: "Next due"` — already plain. **OK.**
- `intervalKmLabel: "EVERY (KM)"`, `intervalMonthsLabel: "EVERY (MONTHS)"`
  — better than "Interval km" but the whole IntervalEditor is 2 boxes
  with a summary sentence explaining what they mean together. That IS
  the "Interval" concept unhidden. **Fix:** move the whole IntervalEditor
  behind "More options" (R8) with the preset default carrying it; label
  it "Remind me every…" when opened. **Severity: friction on AddLog.**
- `recalculate: "Recalculate totals"` in owner menu on GroupSpend.
  R6 says → "Fix totals". Rename in the owner menu. Body copy in
  `recalculateBody` mentions "re-reads every service entry" which is
  fine for the owner tool. **Severity: friction (owner only).**
- `alreadyPendingTitle: "Waiting for owner"` — let me confirm the exact
  wording used matches "Waiting for owner to approve" per R6. Currently
  `alreadyPendingBody` says "You've already asked to join. The owner
  hasn't answered yet." — plain, but doesn't say the notification will
  land. **Fix:** append "You'll get a notification when they answer."
  **Severity: cosmetic.**
- `join.missingToken` says: "This group has no invite code yet. It was
  created before invites existed — add a joinToken field to the group
  in the Firebase console, or recreate the group." That is a developer
  message shown to a user. **Fix:** rewrite as "This group's invite
  isn't set up yet. Ask the group owner to open the invite screen
  once — that fixes it." **Severity: blocker (rare path).**

### CC4 — Firebase error string leaks (R6 blocker)

`firebaseErrorMapper.ts` maps `permission-denied` to "You don't have
permission to do that." — that is *any* permission denial, from log
write to member removal, all wearing the same jargon. R6 wants: "You
don't have edit access for this car. Ask the group owner."

The mapper is one-size-fits-all; the caller has the context. **Fix:**
each controller catch that expects `permission-denied` should map to a
context-specific human sentence at the call site, and the mapper
returns a generic fallback only. Also: `default` case of the mapper
returns "An error occurred. Please try again." — that IS Auntie-safe,
but the console.warn should stay.

Affected controllers (grep hit): `AuthController`, `SpendController`,
`CarsController`, `JoinController`, `LogsController`,
`GroupsController`, `NotificationsController`. **Severity: blocker on
the failure path.**

### CC5 — Two "primary" solid buttons on some auth screens (R1)

- `LoginRegister`: `btn-primary` (submit) **and** `GoogleButton` render as
  competing bold buttons stacked below the form. Two solids ≠ one
  primary.
- `JoinWithCode`: "Scan QR" (solid outline via `join-scan-btn`) and
  "Paste code" (solid `btn-primary`) — two paths, but the visual
  weight competes.

**Fix (R1):** on LoginRegister keep submit as the sole solid primary;
Google button becomes secondary/outline (still with the G mark). On
JoinWithCode keep "Scan QR" as primary (the phone path), demote "Paste
code" to secondary. **Severity: friction.**

### CC6 — Cramped rows (R3, R4 friction)

- `MembersPanel` row (owner view): name + owner badge + joined date +
  remove trash icon + carAdder toggle below. On a 390px screen the row
  gets busy. Toggle is on a separate line — OK-ish — but the "Manage
  who's in this group" title + count is on top, all cramped.
- `LogHistory` row: type name + date + odometer + who logged + cost, then
  action row underneath with "Notes" disclosure + edit + delete. Five
  pieces of info per row.
- `CarStats` grid: two stats side-by-side; ≥390px probably fine, need to
  check at 320-360px (older Android).
- `CarPhotoPanel` chip: 3 icons × ~44px + padding = ~150px pill. Fits,
  but three icons is the maximum before the pill starts to compete with
  the photo.

**Fix (R3, R4):** stack log-row content into two clean lines (type +
cost on line 1; date + km + who on line 2), drop the who-logged line by
default (only show on tap/notes-expand). Members row: pull the joined
date into a smaller second line; keep only the remove button; the
carAdder toggle moves to a "More" section — see CC10. **Severity:
friction, "cramped" is direct user feedback.**

### CC7 — No dedicated "primary action" pattern (R1 friction)

The app has `app-btn-primary` (teal solid) and `btn-primary` (auth-shell
teal solid). They live in two stylesheets and have subtly different
sizes. Also lots of `app-btn-inline` variants.

**Fix (Phase 1):** consolidate into ONE `<Button variant="primary" |
"secondary" | "text">` component, enforcing 48px min-height, 44px min
tap target, single teal solid per screen. Retire the two-style-file
split. **Severity: friction — cause of R1 drift.**

### CC8 — Empty states without primary actions (R7)

- **DueList empty on the car page:** `noneTracked` sentence, no action.
  Auntie's next move is "log a service" — put a secondary link there.
- **WhatsDue empty on the group:** `groupNothing` sentence, no action.
  Fine — the answer is "everything's fine".
- **Notifications empty:** sentence, no action button. Fine — no action
  to take.
- **PendingRequests empty:** sentence, no action. Fine.
- **HomePage empty:** ✓ has Create + Join buttons.
- **GroupDetail cars empty:** ✓ empty message, then a separate Add-car
  button below. **Fix:** put the "Add car" primary action INSIDE the
  empty state card rather than after it, so the eye and the finger land
  in the same place. **Severity: friction.**

### CC9 — Type hierarchy has 4+ levels (R5 friction)

Grep-in-place count of visible size tokens: `--text-display` (h1),
`--text-title` (h2/panel title/empty title), `--text-body` (body/inputs),
`--text-sm` (secondary), `--text-xs` (metadata/timestamps),
`--text-label` (12px uppercase). That's SIX sizes, plus display face vs
sans face.

Per screen it usually reduces to 3–4 in practice — but LogHistory row
uses `--text-body` for type + `--text-sm` for the cost + `--text-xs` for
date/odometer/who, so 3 sizes in a single row. **Fix:** collapse to
type/body/meta = 3 per row, keep the token scale but stop reaching for
6 on one screen. **Severity: cosmetic-plus (contributes to "cramped").**

### CC10 — Progressive disclosure not applied (R8 blocker on AddLog)

Two big offenders:
- **AddLog:** 7–9 visible fields (type, cost, date, mileage,
  "also-set-current" checkbox conditional, IntervalEditor km + months +
  summary sentence + reset button, notes). Auntie will bounce.
- **AddCar / EditCar `CarFields`:** brand + model + year (3 required) +
  divider + nickname + plate (+ odometer on Add). 6+ fields. The
  "OPTIONAL" divider is helpful but the optional fields render
  expanded by default.

**Fix:** AddLog top-level = type, date, mileage, cost (4). Everything
else (Interval, notes, bump-current-reading) collapses behind **"More
options"**. Presets from `maintenance-types.json` carry the interval
default so Auntie never opens it. AddCar/EditCar: after the "OPTIONAL"
divider, wrap the optional block in a collapsed disclosure titled
"More details (nickname, plate, mileage)". **Severity: blocker on
AddLog, friction on Add/EditCar.**

### CC11 — Silent saves (R9 friction)

Several actions save without feedback:
- **CarStats odometer update:** on success, closes the form. `locale.cars.odometerSaved`
  exists — is it actually shown as a toast? Grep needed to confirm.
- **Photo save via editor:** closes editor on success. Toast? Need to
  check.
- **CarFields save via EditCar:** navigates back. Feels OK because
  navigation = confirmation.

**Fix:** every mutation that stays on-screen gets a toast; every
mutation that navigates gets no toast (the navigation IS the feedback).
Verify each path in Phase 2. **Severity: friction.**

### CC12 — Destructive/admin confirms are inline, not a dialog (R10 partly met)

Current pattern: inline confirmation swap (delete button → "Are you
sure?" text + confirm/cancel row).
- `MembersPanel` remove: inline confirm ✓ names the person.
- `GroupMembers` delete/leave: inline confirm ✓ with `deleteConfirmPrompt`.
- `LogHistory` delete: inline confirm ✓ says "The car's totals will be
  adjusted."
- `CarDetail` delete: inline confirm ✓ says the consequence.
- `CarPhotoPanel` remove: inline chip swap ✓.
- `CarStats` odometer-lower guard: inline red confirm ✓ with body text.

R10 says "confirm dialog stating the consequence." Inline confirm
already states the consequence in these cases — this is arguably
BETTER than a modal on a phone. **Fix:** leave the pattern; audit each
confirm's copy for "state the consequence explicitly" (some do,
`photoRemove` inline doesn't say what happens). **Severity: cosmetic.**

---

## Per-screen audits

### 1. Shared chrome — TopBar

- **(a) Purpose.** The one persistent piece of app identity + navigation:
  brand → home, bell → notifications, avatar → settings + sign out.
- **(b) Most likely action.** Tap the bell if the badge is red;
  otherwise ignore.
- **(c) R violations.**
  - R2: bell is icon-only. Aria-labelled but no visible text.
  - R3: three 44px targets in a row (brand link, bell, avatar) at 8px
    spacing. Passes at minimum. Brand link now has ~180px width and no
    negative gap thanks to the recent polish pass.
- **(d) Fix.** Accept the bell as icon-only — universal glyph, red
  badge does the talking. **Do not** re-add a visible sign-out button
  (see AccountMenu.tsx comment — that was the source of the mis-tap
  incident).
- **(e) Severity: cosmetic.**

### 2. Shared chrome — AccountMenu

- **(a) Purpose.** Hide sign-out one tap deeper than the bell; also
  reach Settings.
- **(b) Most likely action.** Rare — Auntie won't sign out.
- **(c) R violations.**
  - None outright. Menu items have icon + label. R10 not applicable
    (sign-out is not confirmed here; it's already tucked behind an
    extra tap, which is the design decision).
- **(d) Fix.** None. This is one of the good ones.
- **(e) Severity: n/a.**

### 3. Shared chrome — BackLink (just landed)

- **(a) Purpose.** One clear back link naming the destination.
- **(b) Most likely action.** Tap back after finishing a task.
- **(c) R violations.**
  - R3 ✓ (44px via padding), R6 ✓ (destination name).
  - R2: has ArrowLeft + text label. ✓
- **(d) Fix.** None — this is already the pattern Phase 1 will lean on.
- **(e) Severity: n/a.**

### 4. Auth — LoginRegister

- **(a) Purpose.** Sign in or sign up with email + password, or Google.
- **(b) Most likely action.** Auntie has been invited by her son via
  Google Sign-In (most likely).
- **(c) R violations.**
  - **R1:** two solid teal buttons stacked — the form submit and the
    GoogleButton. (CC5)
  - **R2:** buttons pass min height. Tabs at the top ("Login" /
    "Sign Up") are text-only underlined-style — acceptable as
    tab-nav.
  - **R6:** "Sign in to access your car logs" — the app is called
    Journey Care, not "car logs"; and "log" is a jargon word here.
    Suggest "Track your family's car maintenance." for the subtitle.
  - **R2/R3:** "Forgot Password?" is a text link — that's the right
    demotion (it's a rescue path, not a primary), but it's only 36px
    tall approx. Needs a tap-target check.
- **(d) Fix.** Google demoted to secondary/outline; keep the G brand
  mark. Subtitle rewritten. Forgot-password link padded to 44px.
- **(e) Severity: friction.**

### 5. Auth — VerifyEmail

- **(a) Purpose.** Block unverified email/password accounts until they
  click the link.
- **(b) Most likely action.** Auntie who signed up with email is
  waiting; she taps "I've verified" once she clicks the mail.
- **(c) R violations.**
  - R1 ✓ (one solid primary).
  - R6: `verify.hint`: "Click the link in that email, then come back
    and continue." — plain and correct.
  - **R9:** on `checkVerification()` success the route guard swaps the
    screen — no toast needed (navigation = feedback). ✓
  - Cooldown counter "Resend in {seconds}s" is fine.
- **(d) Fix.** None substantive. Pass through Phase 1 primitives.
- **(e) Severity: cosmetic.**

### 6. Auth — ChooseUsername

- **(a) Purpose.** One-time display-name capture.
- **(b) Most likely action.** Confirm the prefilled Google display name
  by tapping Continue.
- **(c) R violations.**
  - R1 ✓, R2 ✓, R6 ✓ (`hint: "You can pick anything — 3 to 20
    characters."`).
  - Sign-out link at the bottom named "Use a different account" — plain
    and correct.
- **(d) Fix.** None substantive.
- **(e) Severity: n/a.**

### 7. HomePage — `/` **⚠ Big Four**

- **(a) Purpose.** Land here signed-in; see groups and quick spend/due
  summary; pick a group or create/join.
- **(b) Most likely action.** Tap her one group card.
- **(c) R violations.**
  - **R1:** empty state (no groups) has Create + Join — Create is solid
    teal, Join is outline secondary. That's ONE primary. ✓
  - **R1:** populated state also has Create + Join underneath the two
    group sections. Under a populated list, Auntie's primary is "open
    my group" (implicit via card tap). Create+Join are secondary at
    that point but currently render at the same weight as under the
    empty state. **Fix:** on populated state, demote Create + Join to
    text links or move them behind an overflow "+ New" affordance.
  - **R4:** the `SummaryStrip` sits between the greeting and the group
    sections. On a phone this pushes the group card partly below the
    fold. That IS what a family will look at, so it earns its place —
    but its own internal padding + rows push it to ~180px tall on a
    single-group user. Not a violation, but see below.
  - **R5:** the greeting + `SummaryStrip` head + eyebrow ("Your
    groups") + GroupCard title + GroupCard meta = five typographic
    levels in the first fold. Passes R5 by token but READS as busy.
  - **R6:** "member" / "members" — Auntie may not use that word about
    her family. `memberCount: "{count} member"` — consider "{count}
    person" / "{count} people" for the family-scale reading. The
    prompt says "Members" is OK if used consistently — deferred.
- **(d) Fix.**
  1. On populated state, hide Create/Join under a single small "+"
     button at the top or a compact "Add another…" link at the
     bottom.
  2. Keep SummaryStrip but shorten its head — one line "3 things due,
     RM 420 this year" instead of two lines with an eyebrow.
  3. GroupCard title bumped one size to make the tap target obvious.
- **(e) Severity: friction (empty-state Auntie is fine; returning
  Auntie is fine; middle Auntie sees clutter).**

**3-second test.** Auntie's eye lands on: (i) the greeting with her
name, (ii) the yellow/red due badge on the strip if any, (iii) the
first group card. She taps the group card. **Passes** in the common
case; **near-miss** if she doesn't own a group and hasn't been added
yet (the empty state is clear so still passes).

### 8. GroupDetail — `/groups/:groupId` **⚠ Big Four**

- **(a) Purpose.** The group's cars space; also the entry point to
  people and invitation.
- **(b) Most likely action.** Tap the car she wants to log against.
- **(c) R violations.**
  - **R1:** `Add car` primary button at the bottom of the cars section
    (if she may add). No other solid on the screen unless the owner
    opens Recalculate. ✓
  - **R4:** the two nav rows (Members + Invitation) sit BEFORE the
    cars. For Auntie those are rarely-used entries; the cars should
    be first. **Fix:** cars list first, admin rows collapse into a
    single "Manage group" secondary link below the list, per the
    prompt's 2d guidance.
  - **R2:** the group-nav rows are labelled buttons ✓.
  - **R4:** "cramped" — the header (name + summary) + the two nav rows
    + `WhatsDue` + Cars eyebrow + first CarCard = five stacked
    blocks before Auntie's first tap target for her actual intent.
  - **R7:** cars empty state has message but Add-car button lives
    OUTSIDE the empty state card. See CC8.
  - **R6:** "Owner tools" `groups.summaryOwner: "You own this group"`
    and `summaryMember: "You're a member"` — plain ✓.
- **(d) Fix.**
  1. Reorder: header → WhatsDue → **Cars** → Spending → Manage group
     link. Bury Members + Invitation + Recalculate under one
     "Manage group" screen or one clearly-labelled section.
  2. CarCard: the whole card is already a link (post-Phase-B). Good.
  3. Move the Add-car primary into the empty state.
- **(e) Severity: friction, one of the two most-visited screens.**

**3-second test.** Auntie's eye lands on: group name → member count →
the two big Members/Invitation rows → What's Due → Cars list. She
tries to tap the car but her thumb hits Members first, or she
scrolls past the nav to reach her car. **Fails** on the "3 seconds
without confusion" test in the common case.

### 9. CarDetail — `/groups/:groupId/cars/:carId` **⚠ Big Four**

- **(a) Purpose.** See a car's photo, its history, what's due, its
  running stats. Log a new service.
- **(b) Most likely action.** Tap "Log a service".
- **(c) R violations.**
  - **R1:** LogHistory's own "Log a service" button (`logs-add`) is
    solid teal ✓. Photo chip has 3 icons ≠ primary. `CarStats.Update`
    for the odometer is a text-link ✓. Delete zone has a red danger
    button — visually loud but only after an explicit reveal. ✓
  - **R4:** on the current layout, the order is Photo → LogHistory →
    DueList → CarStats → CarSpend → DangerZone. The "log a service"
    button sits at the *bottom* of the loaded history list, so
    depending on scroll depth it may not be visible on first paint.
    **Fix:** promote a persistent primary — the button either
    duplicated at the top of the history panel, or (better) a
    sticky bottom-of-viewport button on the car page.
  - **R2:** photo chip icon-only (CC1).
  - **R6:** Odometer everywhere (CC2). "Corrected {date}" mostly fine.
  - **R4:** what's due is BELOW the history. Prompt 2b says: due
    summary FIRST, then history. **Fix:** move `DueList` above
    `LogHistory` (photo → what's due → history → stats).
  - **R5:** page uses h1 + panel-title + row-type + row-meta + cost
    accent. Four sizes visible. Manageable but on the edge.
- **(d) Fix.**
  1. Reorder to photo → DueList → LogHistory → CarStats → CarSpend →
     DangerZone.
  2. Add a "Log a service" primary in the thumb zone — either
     duplicated above the history OR sticky at the bottom of the
     viewport.
  3. LogHistory row: two-line clean format (type + cost / date + km);
     drop who-logged from the row (surface on notes-expand only).
  4. Icon-only edit/delete on log rows get labels — either "Edit" /
     "Delete" text or move to a per-row overflow menu.
- **(e) Severity: friction; the "instant status answer" from prompt 2b
  is currently third-fold.**

**3-second test.** Auntie's eye lands on: car name + edit → photo →
first history row's cost. She'd tap the photo (it looks tappable) or
scroll to find the log button. **Passes** for reading history,
**fails** for logging a new service quickly.

### 10. AddLog — `/groups/:groupId/cars/:carId/logs/new` **⚠ Big Four — most important fix**

- **(a) Purpose.** Log a new service (or edit an existing one) — the
  primary write path of the whole app.
- **(b) Most likely action.** Save an "engine oil" entry with today's
  date, current mileage, and cost.
- **(c) R violations.**
  - **R8 blocker:** 7–9 visible fields. Type → (custom label
    conditional) → cost → date → mileage → mileage hint → bump-car
    checkbox conditional → IntervalEditor (km + months + summary +
    reset) → notes → save. Auntie's bounce point. (CC10)
  - **R2:** type picker is a native `<select>` via `SelectField`.
    Native picker is *good* on phones but shows one value at a time
    — 21 types in 5 groups means Auntie sees a wheel/list opened by
    the OS. **Prompt 2c says:** "large tappable list/grid with names
    (and icons if they exist)." That's a different UX. Recommend
    keeping native `<select>` for phones (it's what banking apps do
    and Auntie knows it), BUT test at Phase 2 with a large-tile
    grid as an alternative. Documenting both options.
  - **R6:** `odometerLabel: "ODOMETER AT SERVICE (KM)"` → "Mileage
    when serviced (km)". `bumpOdometer: "Also set this car's current
    reading to {km} km"` → "Also update this car's current mileage
    to {km} km."
  - **R4:** field labels are uppercase (`text-label`) — fine as
    label chrome; contrasts with placeholder ✓.
  - **R9:** on save the page navigates back to the car — the car
    page then shows the new next-due badge. That's the cause→effect
    Auntie needs to see. ✓ (Prompt 2c satisfied automatically once
    the reorder in item 9 lands.)
  - **R7:** N/A — this is a form, not a list.
  - **R1:** one solid "Save entry" ✓.
- **(d) Fix.**
  1. Fold the visible-by-default set down to **four**: Type, Date,
     Mileage (km), Cost (RM). Everything else collapses under **"More
     options"** disclosure, closed on first load.
  2. Presets carry the interval default automatically (already true
     in code). Hide the IntervalEditor's summary sentence + reset
     button until the disclosure is opened.
  3. "Also update this car's current mileage" checkbox moves inside
     "More options" — its default (`true`) already gets the sensible
     behaviour without Auntie ever seeing it.
  4. Notes moves inside "More options".
  5. Custom-label field stays visible only when Type = Custom (already
     the behaviour).
  6. Glossary swap for all "Odometer" strings.
- **(e) Severity: **blocker**. This is THE screen that decides whether
  the app is used at all.**

**3-second test.** Auntie's eye lands on: page title → Type dropdown.
She picks "Engine oil" — the OS wheel scrolls, she taps. Then Cost.
Then Date (today already). Then Mileage. Then Save. **After fix**:
five visible fields, thumb never leaves the bottom half. **Passes**.

### 11. GroupMembers — `/groups/:groupId/members`

- **(a) Purpose.** See who's in the group; owner: manage.
- **(b) Most likely action.** Auntie (member): scan and leave. Owner:
  accept a pending request.
- **(c) R violations.**
  - **R1:** no solid primary. That's *correct* — it's a management
    screen with several equally-weighted actions. R1 says "if none,
    promote most likely." **Fix:** none for a member view; for an
    owner with a pending request, the pending-request panel already
    puts Accept+Decline as visible buttons — that IS the primary.
  - **R2:** owner "remove member" is icon-only (CC1). Fix: icon +
    "Remove" text OR expose only when confirming.
  - **R3, R4:** members row (owner) is dense — see CC6.
  - **R6:** `manageTitle` currently "People in this group" is plain.
    Members grid title fine. AccessGrid title "Who can edit each
    car" plain.
  - **R10 ✓:** every destructive action confirms inline stating the
    consequence.
  - **R6:** AccessGrid `accessImplicitOwner: "Group owner — always
    has edit"` and `accessImplicitCreator: "Added this car — always
    has edit"` — plain and useful ✓.
- **(d) Fix.**
  1. Remove button: icon + "Remove" text OR just a text link.
  2. Owner-view row: put the carAdder toggle inside a per-member
     "Manage" disclosure so the default row is one clean line
     (name + badge + joined date).
  3. AccessGrid: prompt 3 says default = per-person rows with bulk
     toggle "Can edit all cars", per-car grid behind "Customize per
     car". This is a real change to the panel; keep current fine-
     grained control but demote it. Owner-only friction.
- **(e) Severity: friction, mostly for owner.**

### 12. GroupInvite — `/groups/:groupId/invite` (owner only)

- **(a) Purpose.** Show a QR + copyable link + typed code so the owner
  can invite someone.
- **(b) Most likely action.** Hold the phone in front of the recipient
  (QR is scanned by the other camera). Fallback: copy the link and
  send via WhatsApp.
- **(c) R violations.**
  - **R1:** no primary action; the QR IS the primary artifact. ✓
  - **R2:** copy buttons are icon-only (CC1). **Fix:** icon +
    "Copy" text label. Copy is the most important secondary here.
  - **R6:** `invite.inviteBody`, `qrHint`, `inviteLinkLabel`,
    `inviteCodeLabel` — need to spot-check for jargon in Phase 2.
    Body is plain; hint is plain.
  - **R6 blocker:** `join.missingToken` (CC3) — dev-facing.
- **(d) Fix.**
  1. Copy buttons: `Copy link` / `Copy code` with icon.
  2. Rewrite missingToken.
- **(e) Severity: friction (copy) + blocker (missingToken, rare).**

### 13. AddCar — `/groups/:groupId/cars/new`

- **(a) Purpose.** Add a car to a group.
- **(b) Most likely action.** Pick brand + model + year (required) and
  save.
- **(c) R violations.**
  - **R1:** one submit ✓.
  - **R8:** the optional block (nickname + plate + odometer + hint)
    renders expanded by default. The `OPTIONAL` divider is there but
    doesn't collapse the fields. See CC10.
  - **R6:** "Nickname (optional)" plain ✓. "License plate" plain ✓.
    Odometer → Mileage.
  - **R6:** `odometerHint: "..."` needs check for jargon.
- **(d) Fix.** Optional block collapses under "More details (nickname,
  plate, mileage)". Odometer → Mileage.
- **(e) Severity: friction.**

### 14. EditCar — `/groups/:groupId/cars/:carId/edit`

- Same body as AddCar minus odometer (odometer is edited from the car
  page). Same fixes: collapse the optional block under "More details".
- **Severity: friction.**

### 15. CreateGroup — `/groups/new`

- **(a) Purpose.** Type a name, submit.
- **(b) Most likely action.** Auntie won't reach this — sons do.
- **(c) R violations.**
  - R1 ✓ (one submit).
  - R2 ✓.
  - R6 ✓ (`createTitle: "Create a group"`, `createSubtitle: "Share
    cars and maintenance with your family."`).
- **(d) Fix.** None substantive.
- **(e) Severity: cosmetic.**

### 16. JoinWithCode — `/groups/join`

- **(a) Purpose.** Two ways in: scan a QR with the camera OR paste a
  link/code.
- **(b) Most likely action.** Auntie won't — she taps the link in
  WhatsApp and lands on `/join/:groupId/:token` (JoinGroup) directly.
- **(c) R violations.**
  - **R1 friction (CC5):** the "Scan QR" button and the paste-code
    submit are both visually strong. **Fix:** demote paste-form
    submit to secondary since scan is the phone-first path.
  - **R6:** `join.pasteButton` etc. — check for jargon in Phase 2.
- **(d) Fix.** See CC5.
- **(e) Severity: friction.**

### 17. JoinGroup — `/join/:groupId/:token` (deep link)

- **(a) Purpose.** Someone tapped an invite link (the most likely
  entry point for Auntie in her whole app lifetime).
- **(b) Most likely action.** "Request to join" — one big button.
- **(c) R violations.**
  - **R1:** ✓ one solid primary depending on state.
  - **R6 blocker:** `alreadyPending` copy — verify it says "You'll get
    a notification when they answer." (CC3).
  - **R7:** every state has an icon + a headline + body ✓.
  - Prompt 3 says: pending requester sees a "clear full-screen state
    ('Waiting for [owner] to approve — you'll get a notification'),
    not a bare list row." Currently JoinGroup DOES show a full-screen
    "already-pending" state — good. But the owner's name isn't
    interpolated. **Fix:** if we know the owner's display name from
    the public/info doc, interpolate it. If not (privacy — public info
    only carries name + ownerId, not owner display name), keep
    generic "the group owner".
  - **PRESERVE the sacred /join deep-link return path exactly** —
    reads correct: auth → verify → username → back to join, via
    `?next=` query param throughout. Verify in Phase 3.
- **(d) Fix.** Rewrite `alreadyPending` body; consider interpolating
  owner name if cheaply available.
- **(e) Severity: friction — Auntie's very first screen.**

### 18. Notifications — `/notifications`

- **(a) Purpose.** See what's happened; deep-link to the relevant thing.
- **(b) Most likely action.** Tap the unread row about a join-request
  answer.
- **(c) R violations.**
  - **R6 ✓:** `describe()` in `NotificationsPage` renders plain
    sentences for every type. `unknown` degrades to a neutral
    sentence.
  - **R1:** no solid primary — "Mark all read" is a `app-btn-quiet`
    text button ✓.
  - **R7 ✓:** empty state has copy explaining what will land here.
    No action button, correctly (there's nothing to do).
  - **R2:** each row is a full-width `<button>` with icon + text
    sentence — good.
  - **R3:** rows are ≥44px tall via padding.
- **(d) Fix.** None substantive.
- **(e) Severity: n/a — this screen is already close to right.**

### 19. Settings — `/settings`

- **(a) Purpose.** Change display name, see email, sign out, see
  version.
- **(b) Most likely action.** None recurring; if she visits, it's to
  see the version or sign out from a shared phone.
- **(c) R violations.**
  - **R1:** "Save name" is teal solid + inline. Sign out is a
    secondary button at the bottom. ✓
  - **R2:** all buttons labelled ✓.
  - **R6:** `emailHint: "Sign-in email. Changing it isn't supported
    yet."` — "isn't supported yet" is fine plain language.
  - **R5:** panels use `app-panel-title` (small uppercase eyebrow)
    plus h1 plus body — clean 3-level hierarchy ✓.
- **(d) Fix.** Pass through Phase 1 primitives; no functional changes.
- **(e) Severity: n/a.**

---

## Dialogs / sheets

### D1 — PhotoEditor modal

- ✓ Native `<dialog>`, focus trap, Esc-to-cancel, labelled Save/Cancel.
- ✓ R1 (one solid "Save photo"), R2 (labels), R6 (plain).
- **Cosmetic:** consider a "?" hint that pinch zooms — Auntie may not
  discover pinch on the first try. Not a blocker.

### D2 — Odometer-lower confirm (CarStats)

- ✓ Inline, red confirm button, explanatory body copy. R6 ✓
  ("Odometers don't go backwards…").
- **Fix (CC2):** rename "Odometer" → "Mileage" in title + body.

### D3 — Delete confirms (log, member, group, car)

- ✓ Inline, name the consequence, second-tap confirm.
- **R10 ✓** across the board.

### D4 — Remove-photo confirm (CarPhotoPanel chip)

- Compact inline swap in the chip.
- **R10 friction:** the confirm chip says "Remove photo" (button) + ✕.
  No sentence stating the consequence ("The photo will be removed. You
  can add another later."). **Fix:** add a one-liner below the chip on
  confirm state.

---

## Read-amplification pre-check (R4/Phase 4 gate rehearsal)

The prompt requires **zero new listeners** in this pass. The current
listener footprint (unchanged by the audit):

| Screen | Listener |
|---|---|
| HomePage | `useGroups`, one `useCarsAcrossGroups` (bounded per group) |
| GroupDetail | `useGroup`, `useCars`, `useRecalculateSpend` (on-demand only) |
| CarDetail | `useGroup`, `useCar`, `useLogs`, `useLogActions` |
| GroupMembers | `useGroup`, `useCars`, `usePendingRequests` (owner-only) |
| GroupInvite | `useGroup`, `ensurePublicInfo` (one write, idempotent) |
| Notifications | `useNotifications`, `useUnreadNotifications` (badge) |
| Settings | none beyond `useUser` |
| Add/Edit forms | reuse the parent screen's listeners via context |

Denormalised fields I confirmed we can lean on without adding reads:
- `car.totalSpend` (drives CarStats + CarCard status).
- `car.lastByType` (drives `dueForCar` — no log reads needed for the
  What's Due summary on GroupDetail).
- `group.spendByYear[year]` (drives home SummaryStrip).
- `group.canAddCars[]`, `car.carEdit[]` (drives permission UI).

**None of the proposed fixes require a new query.** Reordering, folding
fields, and swapping copy are all render-time. Bulk-toggle "Can edit
all cars" (Phase 3 admin) reads existing per-car state, only its writes
change. Sticky "Log a service" button on CarDetail reuses the existing
`useLogs` and `useLogActions`. **Gate rehearsal passes.**

---

## 3-second test summary (Big Four)

| Screen | Eye lands on | Tapped first | Pass? |
|---|---|---|---|
| **HOME** (empty) | Greeting → "No groups yet" → Create/Join | Join group | ✅ |
| **HOME** (populated) | Greeting → SummaryStrip → group card | Group card | ✅ but busy |
| **GROUP** | Header → Members/Invitation rows → What's Due → Cars | Members row by accident, or scrolls | ❌ |
| **CAR** | Header → Photo → history row | Photo (thinks it's tappable) or scrolls to Log button | ⚠ near-miss |
| **ADD LOG** | Title → Type dropdown | Type dropdown | ❌ (8 fields, bounces) |

Two ❌ and one near-miss confirm the prompt's focus was right: the
GroupDetail reorder + CarDetail sticky primary + AddLog progressive
disclosure are the three biggest wins to plan Phase 2 around.

---

## Severity roll-up (what Phase 2 should tackle first)

**Blockers** (Auntie stalls or bounces):
- CC1 icon-only buttons (LogHistory, MembersPanel remove, InvitePanel copy).
- CC4 Firebase permission-denied string on write paths.
- CC10 AddLog visible-field count.
- CC3 `missingToken` dev-facing sentence.

**Friction** (she completes it slower or wrong):
- CC2 "Odometer" → "Mileage" everywhere.
- CC5 two-primary auth screens.
- CC6 cramped rows (log history, members owner view).
- CC8 empty state without primary (GroupDetail cars).
- Screen-level: GroupDetail reorder (§ 8), CarDetail reorder + sticky
  primary (§ 9).
- Owner: AccessGrid bulk-toggle pattern (§ 11).

**Cosmetic** (she notices but proceeds):
- CC7 button primitive consolidation.
- CC9 four+ type sizes on one screen.
- CC11 silent-save toast pass.
- D4 remove-photo confirm sentence.

---

## Ready for Phase 1?

If the review confirms:
1. The severity ranking above.
2. That AccessGrid can be a per-person rows + "Customize per car"
   disclosure (a real UX change, not just relabel).
3. That LogHistory can lose the who-logged line from the default row.
4. That the SelectField picker on AddLog stays native (recommendation)
   rather than becoming a large-tile grid.
5. That GroupDetail buries Members + Invitation under a "Manage group"
   secondary link.

Then Phase 1 (primitives + tokens) can start. I will not touch code
until this audit is signed off.
