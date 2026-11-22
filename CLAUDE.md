# Journey Care

A minimalist car maintenance tracking & budgeting web app. React + Firebase, zero-cost infrastructure. **Web only — no Android/iOS builds.** Mobile users use the responsive web app in their phone browser.

## What this project is
- Shared groups → cars inside groups → maintenance logs per car (logs are Phase 2).
- Access control is **per-car**, not per-group. Group membership grants view; owners elevate access car by car.
- Current work: **Phase 2** — see `specs/phase-2/spec.md` (what), `plan.md` (how) and `tasks.md` (order, T9–T16). Decisions **D1–D5 at the top of spec.md are approved as written** — spend scope, settings contents, no km/day projection, photos in the Firestore doc (not Storage, which needs Blaze), in-app reminders only.
- ✅ **PHASE 2 IS COMPLETE AND DEPLOYED** (T9–T16, 2026-07-27). Live at **https://car-log-project.web.app**. Gates at ship: 372 vitest, 318 emulator rules tests, lint + typecheck clean. Next work is Phase 3 — write `specs/phase-3/` before building anything.
- ⚠️ **`.app-page` and `.app-container` use `overflow-x: clip`, never `hidden`.** `hidden` forces the other axis from `visible` to `auto`, quietly nesting a second scroll container inside the document's — and the backdrop blobs, which hang past the bottom edge, give it something to scroll. That shipped as "the page scrolls in two halves". `src/styles/layout.invariants.test.ts` parses the real stylesheets and fails on a regression, on a sub-16px form control, or on any new `overflow-y: auto`. See BUGS.md #18.
- 📋 **`POLISH.md` is the fine-tuning backlog**, `BUGS.md` is what was fixed and what risk is accepted. Both were fully triaged at T16 — nothing was silently dropped. Read POLISH.md before picking up "small" work; several obvious-looking improvements are deliberate omissions with reasons.
- 💡 **T14 needed no rules change, and knowing why matters.** The Recalculate repair rides branches that were already open (`isLogDenormalisation` on cars, the owner metadata branch on groups) — because those branches never could verify that a counter change accompanied a real log. **Recalculate is owner-only as a product decision about a heavy read, NOT a boundary the rules enforce**; any edit holder can move `totalSpend`, and must be able to, since logging a service does exactly that. `tests/rules/spend.test.ts` pins both halves.
- ⚠️ **`firebase.json` header order is load-bearing.** Hosting applies every matching entry and, for the same header key, **the LAST one wins** — the opposite of `rewrites`. Broad first, specific last. Listing `/assets/**` before the `/**` catch-all shipped every fingerprinted asset as `no-cache` for months. Verify the live response, not the config: `curl -sI https://car-log-project.web.app/assets/<hashed>.js`.
- ⚠️ **Firestore never cascades.** Deleting a group deletes logs → cars → group, in that order, client-side (`deleteGroup`). The order is load-bearing: every child's delete rule calls `groupExists()`. Any new subcollection must be added to that cascade, or it becomes unreachable-and-permanent the first time someone deletes a group.
- ⚠️ **The CarImages API (C4) is STRIPPED** — `api.carimagery.com` is gone and its successor is $19.99/month, which decision #1 forbids. There is **no `imageUrl`** on car documents or in the rules; the image precedence is `photo ?? placeholder`. Don't revive C4 without a new spec item. See `specs/CONTEXT.md § the CarImages gate`.
- **Car photos live in the Firestore document** as JPEG data URLs (Storage needs Blaze). Budget is **250,000 characters** client-side against a **350,000-character** rules guard — characters of the data URL, not kilobytes of JPEG. See `specs/CONTEXT.md § Photos live in the document`.
- Phase 1 is complete and deployed, including a polish pass (design refresh, mobile-first, group screen split, notification fix). See `specs/phase-1/` and `specs/CONTEXT.md`.
- **`specs/CONTEXT.md` holds the standing decisions and lessons** — the "why" behind the rules, the design refresh, and the mobile-first constraints. `tasks.md`'s citations (decision #6 "access is per-car", the read-amplification lesson) resolve there.
- 🔒 **The Phase 1 security property:** a requester can never write themselves into a group. The only path into `memberIds` is an owner-authenticated update that adds exactly one uid; a would-be member can write nothing but a `pending` request about themselves. `tests/rules/joinRequests.test.ts` encodes the attack cases — **treat those tests as the spec** and never weaken `groups.update` or `joinRequests` without them staying green.
- App name is **"Journey Care"** everywhere, including `locale/English.ts` (it used to say "CarLog").
- ⚠️ **`specs/phase-1/spec.md` covers the A-series and S3 only.** A6 is owner-authored; A1–A5, A7, A8 were reconstructed from plan.md/tasks.md/shipped code and still need owner review. G1–G11, N1–N5, D1–D4, S1–S2 are cited by `tasks.md` but not yet written — author them before building T3 onwards.

## Hard constraints — never violate
- **Zero cost.** Firebase Spark tier. No paid services or APIs. If a task seems to need one, stop and ask.
- **Web only, responsive.** Every screen must work on desktop AND phone browsers. QR scanning uses the phone browser's camera (getUserMedia); desktop uses the paste-a-link path.
- **Server-side security.** Permissions are enforced in Firestore security rules, never only in UI. Any new read/write path needs a matching rule.
- **Spec-driven.** Do not build features not in the current phase spec. If something seems missing or contradictory, ask before coding.
- **No Cloud Functions in Phase 1** (keeps the project card-free). The join-accept flow uses the constrained-rules approach in plan.md.

## Stack & conventions
- **React 19 + TypeScript + Vite.** Migrated off Create React App in T1 (CRA is deprecated and unmaintained). Scripts: `npm run dev` / `build` / `preview` / `lint` / `typecheck` / `test` / `test:rules`.
- **Plain CSS**, one stylesheet per component/page, imported by that component (`import "./Foo.css"`). No Tailwind, no CSS-in-JS, no CSS Modules.
- **Design tokens are CSS custom properties in `src/styles/tokens.css`** — colours, type scale, spacing grid, radii, control heights, safe areas. Components use `var(--…)`, never raw hex and never a bare px value for spacing or type. **Tokens are mobile-first**: every value is the phone value, and one `min-width: 600px` query scales a few of them up. Shared chrome lives in `src/styles/auth-shell.css` (full-screen card surfaces) and `src/styles/app-shell.css` (signed-in pages: page shell, back link, headings, panels, buttons).
- `lucide-react` for icons.
- **react-router** for routing. Realtime data via Firebase SDK `onSnapshot` listeners + context/hooks — **no TanStack Query**; plain hooks are sufficient at this scale. Revisit only if cache invalidation becomes painful.
- Firebase JS SDK v9+ modular imports only: Auth (Google + Email/Password with verification link — **these two only; no Apple, no Facebook, no phone [A8]**), Firestore, Hosting. Initialized once in `src/configurations/firebase-config.ts`.
- **Firebase config comes from `.env`**, read as `import.meta.env.VITE_FIREBASE_*`. `.env` is gitignored; keep a committed `.env.example` in sync when keys change. (These are public web identifiers — env is convenience, not secrecy.)
- **Architecture is MVC-ish, not feature-sliced**: `pages/` render, `controller/` holds logic as hooks (`useAuthController`), `context/` holds app-wide state, `model/` holds types and defaults. Follow this — do not introduce a `features/` tree.
- **User-facing strings live in `src/locale/`**, read via `useLanguage()` or `t()`. Don't hardcode copy in components.
- ⚠️ **From Phase 3 T17 onward, every new user-facing string goes through the t() / locale helper.** No hardcoded English literals in JSX, toasts, alerts, aria-labels, or error messages. Add the string to `src/locale/English.ts` (and the ms/zh dictionaries once T19 lands), then read it via `useLanguage()`. Rationale: T19 retrofits pre-Phase-3 code once; new strings that skip the helper silently break trilingual coverage. `specs/phase-3/plan.md § 5` risks list this explicitly.
- ESLint + `tsc --noEmit` must pass clean at every task boundary.
- Design: **true minimalism** since the 2026-07-27 refresh — near-white page, white surfaces, hairline borders (no card shadows), a single accent, neutral greys elsewhere, one typeface with six sizes, 8px spacing grid, card radius 14px, one 48px control height. Full rationale in `specs/CONTEXT.md § Design`. **`specs/design/` does not exist** — the built screens are the working reference. **Extend the token system; don't restyle screen by screen.** If mockup images are added later, they supersede this.
- **Two accent sets, chosen at runtime**: deep teal `#0F766E` by default, near-monochrome under `?theme=mono` (`src/utils/theme.ts` stamps `data-theme` on `<html>` before first paint). Both live in `tokens.css`; **no component stylesheet knows which is active.** If a screen needs a colour edit to follow a theme change, that's a leftover hardcode — fix the token wiring. `tokens.contrast.test.ts` parses the real stylesheet and enforces WCAG AA plus a hue gap between the accent and the status colours, for both sets.
- **Mobile-first is a hard rule.** Primary users are on phones. Audit at 375/390/430px; ≥44px touch targets; inputs ≥16px (or iOS zooms); never nest a panel inside a panel. See `specs/CONTEXT.md § Mobile-first`.

## Structure
```
src/
  main.tsx, App.tsx            # App.tsx holds the router + route guards
  configurations/
    firebase-config.ts         # initializeApp, getAuth, getFirestore, providers
  styles/
    tokens.css                 # design tokens — mobile-first; scale UP only
    backdrop.css               # the (now very faint) background blobs
    auth-shell.css             # full-screen card chrome (@imports backdrop)
    app-shell.css              # signed-in page chrome: .app-page/.app-main,
                               #   .app-back, .app-h1, .app-panel, .app-btn*
  components/                  # presentational, grouped by area
    login_register/            # AuthTextField, GoogleButton
    toast_message/             # ToastMessage
    app_shell/                 # TopBar (logo, bell + unread badge) [H1,N2],
                               #   AccountMenu (sign-out lives in here),
                               #   Splash + Skeleton (branded loading),
                               #   OfflineBanner
    groups/                    # GroupCard [H2,H4], InvitePanel [G3,G4],
                               #   PendingRequests [G6,G7], GroupNameEditor [G12],
                               #   MembersPanel — identity, removal, and the
                               #     group-level canAddCars toggle [C1,G9,G10]
                               #   AccessGrid — per-car edit, its OWN panel:
                               #     grid on wide screens, accordion on phones
                               #     [C6,C7]
    cars/                      # CarCard [C10], CarFields + carFieldsValue
                               #   (shared by Add/Edit), CarPhotoPanel [C5],
                               #   CarStats — odometer + lifetime spend as two
                               #     small stats, and the odometer's
                               #     lower-reading guard. Replaced
                               #     OdometerPanel, which gave the reading a
                               #     panel and display-size type directly under
                               #     the photo [C9, S1]
    logs/                      # LogHistory [L6] — history + the client-side
                               #   search over the LOADED page (see
                               #   lib/logSearch.ts; it never queries),
                               #   IntervalEditor [L4]
    due/                       # DueBadge [C10,R3], DueList (car page),
                               #   WhatsDue (group page)
                               #   — status colours only, never the accent
    spend/                     # CarSpend (total + by-type) [S1], GroupSpend
                               #   (all-time + per-car + the owner-only
                               #   Recalculate) [S1]. One Spend.css for both —
                               #   they are the same object: a headline figure
                               #   over labelled amounts. Numbers, no charts.
    summary/                   # SummaryStrip — home's H6 slot [H6,R3,S2,D1].
                               #   Was T13's DueStrip; renamed when T14 wove
                               #   per-group current-year spend into the same
                               #   line rather than stacking a second card.
    form/                      # SelectField — native <select> chrome matching
                               #   AuthTextField [C2]; ToggleSwitch — the one
                               #   switch, shared by both toggle kinds
    qr/                        # QrScanner — lazy-loaded, html5-qrcode [G4]
  pages/
    LoginRegister/             # auth screen (Login / Sign Up toggle) — no username field
    VerifyEmail/               # email verification gate [A4]
    ChooseUsername/            # one-time display-name screen [A6]
    HomePage/                  # signed-in landing: Your groups / Joined [H1–H6]
    GroupDetail/               # /groups/:groupId — the CARS space [G2]
    GroupMembers/              # /groups/:groupId/members — list, requests,
                               #   delete/leave [G6,G7,G9,G10,G11]
    GroupInvite/               # /groups/:groupId/invite — QR + link, OWNER ONLY
    AddCar/                    # /groups/:groupId/cars/new [C1–C3]
    CarDetail/                 # /groups/:groupId/cars/:carId [C5,C8,C9,C10]
                               #   Order: photo → service history → what's due
                               #   → stats → delete. **No details panel** — the
                               #   page is about servicing, and brand/model/
                               #   year/nickname are already the header while
                               #   the edit screen is where you change them.
                               #   The plate stayed, in the header: identity,
                               #   not detail. Edit is a header action.
    EditCar/                   # …/cars/:carId/edit — carEdit holders [C8]
    AddLog/                    # …/cars/:carId/logs/new (+ /:logId/edit) [L1–L5]
    Settings/                  # /settings — display name (the ONLY editor of
                               #   users/{uid}.username after first run), email
                               #   read-only, sign out, version [SET1, SET2].
                               #   Reached from AccountMenu, not the top bar.
                               #   Renaming FANS OUT: the name is denormalised
                               #   onto every group as members[uid].username,
                               #   so renameUser writes the profile and then
                               #   one group update per membership. Skip the
                               #   fan-out and the screen silently does nothing
                               #   visible. See BUGS.md #17.
    Notifications/             # /notifications [N4]. A notification's deep
                               #   link is a DIFFERENT SCREEN PER TYPE —
                               #   join_request → members, access/due → that
                               #   car, declined/removed → nowhere (they're
                               #   addressed to non-members, so every target
                               #   inside the group is "not found"). An
                               #   unknown type renders neutrally rather than
                               #   coercing. See handleOpen. [T15]
    CreateGroup/               # /groups/new — create with seeded owner [G1]
    JoinWithCode/              # /groups/join — scan or paste an invite [G4]
    JoinGroup/                 # /join/:groupId/:token — request to join [G5]
  controller/                  # logic — AuthController.ts (useAuthController),
                               #   GroupsController.ts (useGroups / useGroup /
                               #     useGroupActions — live onSnapshot + writes),
                               #   JoinController.ts (useInvite /
                               #     usePendingRequests / useRequestDecisions),
                               #   NotificationsController.ts (bell count, list,
                               #     mark read — all queries bounded),
                               #   CarsController.ts (useCars / useCar /
                               #     useCarActions / useCarEditActions /
                               #     useCarAccessActions),
                               #   LogsController.ts (useLogs / useLog /
                               #     useLogActions — every mutation batches
                               #     lastByType + totalSpend + spendByYear),
                               #   DueController.ts (useCarsAcrossGroups —
                               #     one bounded cars listener per group;
                               #     tallyByGroup; useDueNotifications, the
                               #     R4 writer, mounted on HomePage ONLY),
                               #   SpendController.ts (useRecalculateSpend —
                               #     the ONLY new write path in T14: a bounded
                               #     full read of a group's history that
                               #     rewrites only the counters that disagree.
                               #     Everything else in T14 is display over
                               #     what T12 already denormalises),
                               #   userProfile.ts (loadProfile / saveUsername)
  data/                        # bundled static JSON — cars-my.json (brand →
                               #   model → year, MY-focused + "Other") [C2],
                               #   maintenance-types.json (presets) [L3] — 21
                               #     types in 5 groups, service AND parts.
                               #     **Preset ids are permanent**: a stored log
                               #     and a car's lastByType key both reference
                               #     them. `group` is display only, so
                               #     regrouping is safe; renaming an id is not.
                               #     Adding a type needs NO code and NO rules
                               #     change — see src/model/newTypes.test.ts,
                               #     which exists to keep that true.
  model/                       # User.ts: UserProfile, UserDoc, DEFAULT_USER
                               # Group.ts: GroupDoc, Group, toGroup, memberCount,
                               #   isOwner, memberEntries, spendInYear [S2,D1]
                               # JoinRequest.ts: JoinRequestDoc, JoinRequest
                               # Notification.ts: types + builders the rules
                               #   validate against — keep the two in step
                               # Car.ts: CarDoc, Car, toCar, carDisplayName,
                               #   hasCarEdit (mirrors carEdit in the rules)
                               # CarCatalogue.ts: typed front door to src/data
                               # Log.ts: LogDoc, Log, toLog, the denormalisation
                               #   helpers T12's batches use. Money formatting
                               #   is NOT here — see utils/money.ts
                               # Due.ts: the ONLY place a Timestamp becomes a
                               #   Date for next-due; labels and status classes
  context/                     # UserContext (session, the only auth listener),
                               #   Toast, LanguageContext
  constants/                   # regex.ts, routes.ts (ROUTES + ?next= helpers)
  utils/                       # firebaseErrorMapper.ts, joinToken.ts,
                               #   inviteLink.ts (build/parse invites), camera.ts,
                               #   imageCompress.ts (canvas → JPEG data URL) [C5],
                               #   theme.ts (accent set from ?theme=),
                               #   useMediaQuery.ts (layout choices CSS can't
                               #     make — different markup, not restyling),
                               #   authMode.ts (popup vs redirect — see
                               #     docs/auth-redirect.md),
                               #   money.ts — THE RM formatter and the rounding
                               #     rule. Everything that shows or stores
                               #     ringgit goes through it. [S3]
  lib/                         # Pure maths. NO Firebase and NO React imports,
                               #   deliberately: `now` is an argument, so every
                               #   threshold is exactly testable.
                               #   nextDue.ts — next-due, plus detectChanges/
                               #     nextStamp, the R4 dedupe. [R1, R2, R4]
                               #   spend.ts — spendYearOf/currentYear (the
                               #     spendByYear key), totalsByType, sumMoney.
                               #     [S1–S3]
                               #   logSearch.ts — matchesLog, the history
                               #     filter. In memory over the loaded page,
                               #     NEVER a query: Firestore has no substring
                               #     match, and a query per keystroke is the
                               #     read-amplification trap. [L6]
  locale/                      # English.ts (+ future languages)
tests/rules/                   # Firestore rules tests (emulator) — npm run test:rules
index.html                     # Vite entry, at repo root (not public/)
firebase.json                  # hosting (public: dist, SPA rewrite) + emulator ports
firestore.rules                # part of every feature's definition of done
specs/                         # SDD documents (source of truth)
```

**Routing & guards** (`App.tsx`). Guards derive the destination from session
state — `useAuthController` never navigates. The ladder, in order:

1. signed out → `/auth`
2. unverified email/password account → `/verify-email` [A4]
3. no username on `users/{uid}` → `/choose-username` [A6]
4. otherwise → `/` or the requested page

`/auth`, `/verify-email` and `/choose-username` each bounce anyone who no longer
belongs there. A signed-out visitor to a protected URL is sent to
`/auth?next=<path>` and returned there afterwards; `next` is carried through the
verify and username screens too, and lives in the URL so it survives both a
reload and the Google redirect fallback.

**`username` comes from Firestore and nowhere else.** `UserContext` deliberately
does not fall back to the provider `displayName` — an empty username is the
signal that routes to the username screen, so a fallback would silently skip it.
`displayName` is kept in `nickname` and used only as an editable prefill.

## ⚠️ Rules changes are inert until deployed

`firestore.rules` in this repo is **not** what your project enforces. Editing it
and passing the emulator tests proves the logic is right; it changes nothing
live. Every task that touches `firestore.rules` must end with this line stated
explicitly to the user, not buried in a checklist:

```
firebase deploy --only firestore:rules
```

Symptom of forgetting: a feature fails with `permission-denied` (surfaced in the
UI as "You don't have permission to do that.") while every emulator test passes.

## Definition of done for any task
1. Matches the spec item it references.
2. Security rules updated if any read/write path changed.
3. Works responsively: desktop Chrome + a narrow (~390px) viewport.
4. ESLint + typecheck clean (`npm run lint && npm run typecheck`).
5. Tests green: `npm run test` (Vitest) and `npm run test:rules` (emulator) if rules changed.
6. If `firestore.rules` changed, the completion message tells the user to run `firebase deploy --only firestore:rules`.
