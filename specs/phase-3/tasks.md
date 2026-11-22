# Phase 3 — Tasks

> Execution checklist. One git commit per task minimum; diff review +
> live-site phone check after each (bypassPermissions safety net).
> Requirement IDs → spec.md; gates → plan.md §4.
> Nothing is blocked — no open decisions remain. Start at T17.

## T17 — Visit-based logging  [V1–V5, gate G-D]
- [x] Visit form UI: shared date/odo/workshop + N line-item rows
      (`src/pages/AddVisit/AddVisit.tsx`, own route `/groups/:gid/cars/:cid/visits/new`)
- [x] Draft = plain serializable object (V4 — AI fills this later)
      (`src/model/Visit.ts` — `VisitDraft`, `VisitItemDraft`, `resolveVisit`)
- [x] Single batched write incl. all denorms + C9 odometer path
      (`createVisit` in `LogsController.ts`; N log docs + car totals/spendByType/lastByType/odometer
      + group spendByYear/spendByMonth, all in one `writeBatch`)
- [x] Decide + state in PR: quick-log KEPT + new visit route added (V3 decision)
- [x] Rules: multi-log batch shape → emulator tests → DEPLOYED
      (extended `isLogDenormalisation` with `spendByType`; extended
      `isSpendUpdate` with `spendByMonth`; new whitelist entries; 343
      rules tests pass; `firebase deploy --only firestore:rules` complete)
- [x] G-D: same-type-twice-in-one-visit test passes (see
      `tests/rules/logs.test.ts § multi-item visit`; UI resolves
      last-item-wins on `lastByType` via array-order tiebreak)
- [x] Docs: CLAUDE.md rule added (t() helper from T17 onward)
- [x] CLAUDE.md rule added: all new user-facing strings via t()
      (applies from this task onward)

## T18 — Parts shelf  [PRT1–PRT7, gate G-I]
- [x] parts subcollection + shape rules → emulator tests → DEPLOYED
      (`cars/{carId}/parts` — `isValidPart`, `isInstallTransition`,
      `isRevertTransition`, `isShelfEdit` branches; 18 new emulator tests)
- [x] Shelf UI on car page (list, value total, empty-collapsed)
      (`src/components/parts/ShelfPanel.tsx`; inline add-form; collapsed
      when the shelf is empty)
- [x] Add part (manual); delete on-hand part
      (`PartsController.usePartActions.addPart` / `deletePart`)
- [x] Install flow: pre-filled visit draft → one batch (log +
      denorms + status flip + installedLogId)
      (Shelf "Install" links to `/visits/new?installingPartId=X`; AddVisit
      pre-fills first item from the part; `createVisit` batches the part
      status flip using the log id it just minted)
- [x] "Not installed yet" toggle on visit line items (PRT5)
      (`Visit.VisitItemDraft.partsShelf`; resolveVisit splits shelf items;
      `createVisit` creates them as `parts/{id}` docs in the same batch)
- [x] Log delete reverts linked part to on_hand (PRT6)
      (`deleteLog` looks up `where("installedLogId", "==", log.id)` and
      adds a revert to the same batch)
- [x] G-I: timer-from-install, single-count spend, rules
      transition tests (all in tests/rules/parts.test.ts), Recalculate
      agreement — parts are excluded from Recalculate (decision #25:
      one accounting path). Group-delete cascade now includes parts.

## T19 — Language setting  [I18N1–I18N6, gate G-H]
- [x] ⟨VERIFY⟩ notification docs store { type, params } not text
      — RESOLVED: docs ALREADY store {type, params}. Some params (dueLabel,
      typeLabel, carName) are point-in-time display strings, deliberately.
      T19 does NOT migrate stored data (see STOP conditions). Instead:
      new due-notice writes carry raw `dueDateMs`/`dueKm` companions, and
      the render path prefers those in the READER's locale, falling back
      to stored dueLabel for pre-T19 records. See CONTEXT.md § I18N5.
- [x] i18n helper + en/ms/zh dictionaries (code-split via
      `mergeLocale` with partial fallback to English)
      (`src/locale/{English,Malay,Chinese,merge}.ts`)
- [x] Extract Phase 1+2 strings; draft ms/zh translations
      (partial coverage; Shirley review pending — see HANDOFF §3)
- [ ] Shirley reviews ms/zh dictionaries (family-facing wording)
      — see HANDOFF.md § 3
- [x] Settings selector; instant apply; users.language + local
      cache; doc wins on login (I18N1–I18N2)
      (LanguageContext with localStorage cache + Firestore fallback;
      saveLanguage in userProfile.ts; changeLanguage in AuthController)
- [ ] Preset maintenance-type names via i18n keys; user input
      verbatim (I18N3) — DEFERRED: user input already verbatim (nicknames,
      custom types, workshop, notes render as-is). Preset labels stay
      in maintenance-types.json for now; extending it to a per-preset
      i18n key map is a follow-up. See HANDOFF § 4.
- [x] Locale date formatting; RM formatter untouched (I18N6)
      (formatNotifiedAt and formatLogDate use `toLocaleDateString(undefined,…)`
      already; localiseDueLabel adds notification date localisation)
- [ ] G-H: persistence, cross-device, reader-language notifications,
      390px spot-check in all three languages — see HANDOFF.md § 4
- [ ] G-C: /join deep-link regression on a real phone in a
      non-English language — see HANDOFF.md § 4

## T20 — Spend visualization  [SPD1–SPD6, gate G-G]
- [x] car.spendByType + group.spendByMonth in every log batch
      (create/edit/delete — subtract-old-add-new) — DONE IN T17
      (co-located per plan.md § 1: "touch that batch once, not twice")
- [x] Recalculate extended = self-heal + backfill
      (`SpendController.totalsFromLogs` now computes byType and byMonth;
      `useRecalculateSpend` writes them alongside totalSpend/lastByType/
      spendByYear when they drift or as first-time backfill)
- [x] Rules accept new map fields → emulator tests → DEPLOYED IN T17
      (isLogDenormalisation extended with spendByType; isSpendUpdate
      extended with spendByMonth)
- [x] Donut (car), monthly bar + per-car bar (group), lazy-loaded
      (`src/components/spend/charts/{ByTypeDonut,MonthlyBar,PerCarBar}.tsx`
      + `LazyCharts.tsx`. Build confirms recharts is its own 312KB chunk,
      NOT in the main bundle. SPD5 satisfied.)
- [x] Empty states; shared RM formatter; token palette only
      (Charts render null when there's no data — an empty axis is worse
      than nothing. Palette from CSS custom properties so the ?theme=mono
      swap reaches every slice with no code changes.)
- [ ] G-G zero-drift check on a real >20-log car, incl. edit/delete
      — MANUAL, see HANDOFF § 4

## T21 — AI Studio gate  [gate G-E — BEFORE any AI code]

**Deviation authorised:** the "BEFORE any AI code" wording is replaced
by BUILD-BEHIND-FLAG. T22 and T23 are implemented fully but gated on
`app/config.scanEnabled` (default `false`). With the flag off, no scan
buttons render and no AI module loads. Shirley runs the gate, sets
`aiModel` to the winning model id and `scanEnabled=true`, then commits.

- [x] Draft receipt + odometer prompts (contracts in AI3/ODO2)
      (`src/lib/aiPrompts.ts` — used verbatim by T22/T23 code; same
      strings appear in HANDOFF § 2 for Shirley to paste into
      AI Studio.)
- [ ] Test vs ≥5 real receipts, ≥3 real dashboard photos — MANUAL by
      Shirley, see HANDOFF § 2. Pass criteria: majority items typed
      correctly (receipts); 8/10 correct (odometer).
- [ ] Record results in HANDOFF § 2; set app/config.aiModel and
      flip scanEnabled=true — MANUAL by Shirley post-gate.

## T22 — Receipt scan  [AI1–AI5, gate G-F]
- [ ] Console: AI Logic + Gemini Developer API backend (NOT Vertex)
      + App Check — MANUAL by Shirley, see HANDOFF § 1.
      Code side: firebase-config.ts reads `VITE_APP_CHECK_DEBUG_TOKEN`
      from .env.local for local dev.
- [x] app/config.aiModel wired; SDK lazy-loaded on first use
      (`src/app/config.ts` + dynamic import in `src/lib/aiClient.ts`.
      Build confirms `firebase/ai` is NOT in the main bundle.)
- [x] Photo pipeline reused → model call → defensive JSON parse
      (compressPhoto → `scanReceipt` → `parseReceipt` with 15 unit
      tests covering happy path + 8 failure branches)
- [x] Pre-filled visit draft; low-confidence flags; next-due
      preview; per-item shelf toggle (PRT5 path)
      (VisitDraft merged into local state; `scanReview` state drives
      the "N items came back uncertain" and "N didn't match a type"
      review lines; PRT5 toggle already exists per-item from T17)
- [x] All three fallbacks implemented (blurry / quota / malformed)
      (`aiClient.classify` maps SDK errors; `handleScanReceipt` shows
      `scanUnreadable` / `scanQuotaExhausted` toasts and lands the user
      on the manual form. Malformed/network log to console only.)
- [ ] G-F: failure paths mocked and verified — MANUAL by Shirley,
      see HANDOFF § 4. Unit tests in aiReceiptParser.test.ts + 
      aiOdometerParser.test.ts cover the parse side (25 tests).

**Gated on `AI_CONFIG.scanEnabled` (default `false`).** With the flag
off, the scan button never renders and `firebase/ai` never loads.
Shirley flips it after the T21 gate — see HANDOFF § 2.

## T23 — Odometer snap  [ODO1–ODO4] — only if G-E passed for it
Same BUILD-BEHIND-FLAG discipline as T22.
- [x] Snap entry point on car page / quick-update control
      (`CarStats.tsx` — "Snap odometer" button next to Update, gated on
      `AI_CONFIG.scanEnabled`. Uses env-camera capture on phones.)
- [x] Old → new confirm with delta; save via C9 path
      (The scan pre-fills the existing odometer edit input — the user
      still confirms via the existing Save button. Reuses the C9
      monotonic guard path unchanged.)
- [x] Lower-than-current = misread flow (no override surfaced)
      (`isMisread` catches: value LOWER than current, prompt's "0"
      couldn't-read-it signal, and any low-confidence read. Any of them
      routes to "retake or type manually" — the C9 monotonic override
      is never surfaced by the scan path. ODO4.)

## T24 — Wrap-up
- [x] BUGS.md / POLISH.md triage batch
      (POLISH.md § 0 added — pre-existing AddCar/layout failures noted,
      I18N3 preset labels + carName point-in-time follow-ups recorded,
      recharts chunk size decision documented)
- [x] CONTEXT.md: status updated, decisions 19–26 appended,
      Phase 3 ⟨VERIFY⟩ markers resolved (Phase 3 status row added;
      decisions block was added in T17; I18N5 verify resolved in T19)
- [x] Grep for hardcoded literal strings introduced after T18
      (string-drift check) — two occurrences found and fixed:
      "Custom" fallback in CarSpend and ByTypeDonut now via
      `locale.spend.customBucket`. No other leaks found across
      T18/T19/T20/T22/T23 code.
- [ ] Live-site phone verification pass; family announcement
      — MANUAL by Shirley, see HANDOFF.md sections 2, 3 and 4.
