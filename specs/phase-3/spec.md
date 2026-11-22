# Phase 3 — Spec

> What Phase 3 is and why. How to build it: plan.md. What to do next:
> tasks.md. Constraints unchanged: zero cost / Spark tier, NO Cloud
> Functions, NO Firebase Storage, rules enforce every path.

## 1. Scope & goals

- **A. Visit-based logging**: one form, many maintenance items, one
  batched write (fixes pain #14 for manual users too).
- **A2. Parts shelf**: record purchased-but-uninstalled spare parts
  per car; timers start only at installation.
- **B. AI intake** (Firebase AI Logic + Gemini Developer API, Spark
  free tier): snap a receipt → pre-filled visit draft; snap the
  odometer → confirmed km update.
- **C. Spend visualization**: donut by type (car), monthly bar +
  per-car bar (group), from denormalized totals only.
- **D. Language setting**: English / Malay / Chinese UI, chosen in
  Settings, persisted per user. UI strings only — user data is
  never translated.

## 2. Non-goals (explicit)

- No push / FCM (D5 stands). No km/day projection (#15 stands;
  revisit only after measuring odometer freshness post onboarding).
- No payments/subscriptions/ads.
- No auto-save of AI output — ever. AI fills drafts; humans save.
- No handwriting guarantee: handwritten receipts are best-effort.
- Landing page, access codes, group/car limits: ALL cut
  (decision #26). Entry gating = the existing QR/URL invite +
  owner-approval join flow. No per-user caps.
- No auto-detect of browser language (default is English, chosen
  explicitly). No translation of user-entered data (car names,
  notes, custom types) or of stored notification params.
- Custom domain remains discussed-not-committed.

## 3. Decisions (append to CONTEXT decision log on adoption)

19. **AI provider = Firebase AI Logic with the Gemini Developer
    API.** Available on Spark, no card, no key in the client
    (Firebase proxy holds it), App Check auto-enforced in setup (Jul
    2026 guided flow). The only path that is simultaneously
    zero-cost and key-safe with no backend. Supersedes the earlier
    tesseract.js plan.
20. **AI extracts facts; the app computes dates.** Model returns
    receipt facts (date, odometer, typed items, costs) and odometer
    readings ONLY. Next-due comes from nextDue.ts + interval
    defaults — one source of truth.
21. **Draft-then-confirm everywhere.** Receipt scan → pre-filled
    visit form; odometer scan → old-vs-new confirm. Manual entry is
    always one tap away and never framed as an error.
22. **Model name from config, not code** (app/config.aiModel).
    Model churn must not require a deploy.
23. **Charts: decision #13's "no charts" is REVERSED — sparingly.**
    Three charts max, drawn from denormalized totals only (never
    log history — read amplification), recharts lazy-loaded, styled
    strictly from existing tokens. Home strip stays numbers-only.
    Also fixes the by-type-from-loaded-logs honesty bug.
24. **i18n: UI-only, three languages (en default / ms / zh),
    per-user setting.** Stored on users/{uid} so it follows the
    user across devices; cached locally so pre-auth screens render
    in the last-used language. Notifications MUST render from
    type + params at display time in the READER's language — never
    from stored rendered text. Amends decision #14: Settings gains
    a language selector. From T17 onward every new user-facing
    string goes through the t() helper (rule added to CLAUDE.md),
    so only pre-Phase-3 code needs retrofitting.
25. **Parts spend counts at INSTALL, not purchase.** A shelf part
    affects no timer and no spend dashboard until installed; the
    shelf shows its own value line so the money stays visible.
    One accounting path = no double-count flags in denorm batches,
    and Recalculate stays logs-only and correct. Parts are per-car
    (matches per-car access + rules); buying generic stock = pick
    the most likely car, moveable later.
26. **No gating features at all: landing page, access codes, and
    group/car limits are CUT.** The QR/URL invite + owner-approval
    join flow (Phase 1) is the sole access control — owners decide
    who's in; sign-up itself is ungated by design (family+friends
    scale, no public discovery). groups.carCount and
    users.groupsOwned counters STAY maintained in batches (already
    there, near-free) as the re-enable path if abuse ever appears.

## 4. Requirements

### Visit-based logging (V) — build BEFORE AI intake
- V1 "Log a visit": shared date + odometer + workshop/notes + N
  line items { type, cost, interval override }. Add/remove rows.
- V2 Save = ONE batched write: N log docs + car.lastByType per
  touched type + car.totalSpend + group.spendByYear +
  car.spendByType + group.spendByMonth + odometer via the C9
  monotonic path. Same batch discipline as Phase 2.
- V3 Existing single-entry flow: keep as "quick log" or one-row
  visit — implementer's call, stated in the PR.
- V4 The visit draft is a plain serializable object — the interface
  both manual entry and AI intake fill.
- V5 Rules must accept the multi-log batch; fix + emulator tests +
  DEPLOY if any rule assumed one log per batch.

### Parts shelf (PRT)
- PRT1 Subcollection cars/{carId}/parts: { typeId|customName,
  label, cost, purchaseDate, notes?, status: "on_hand"|"installed",
  installedLogId? }. Car-EDIT holders create/edit/delete; viewers
  read.
- PRT2 Shelf list on the car page (collapsed when empty): label,
  type, cost, purchase date, shelf value total.
- PRT3 On-hand parts affect NOTHING: no lastByType, no next-due,
  no bars, no spend denorms. Purchase date is informational only.
- PRT4 "Install" on a part opens the visit form pre-filled with
  that item (type + cost carried; user supplies install date +
  odometer). Save = ONE batch: log(s) created, denorms updated
  (spend counts NOW — dec. #25), part → status "installed" +
  installedLogId. Timer starts from the install date/odo.
- PRT5 A visit line item can also be sent TO the shelf via a
  per-item "not installed yet" toggle (bought during a workshop
  visit but kept). Toggled items create parts, not logs.
- PRT6 Deleting an on-hand part is free (no history touched).
  Installed parts are audit trail: delete only via deleting the
  linked log (existing flow), which reverts the part to on_hand.
- PRT7 Rules: parts shape validation; status transition
  on_hand→installed ONLY alongside a log create in the same batch;
  cost immutable after install (it's in the denorms).

### AI intake — receipt (AI)
- AI1 "Scan receipt" on the visit form. Reuses the existing photo
  pipeline (resize, JPEG compress, HEIC, EXIF) before the call.
- AI2 Firebase AI Logic JS SDK, Gemini Developer API provider, App
  Check enforced. AI module lazy-loaded on first use.
- AI3 Prompt contract (facts only, JSON only):
  { date, odometer?, workshop?, items: [ { type: <id from
  maintenance-types.json | "other">, rawText, cost,
  confidence: "high"|"low" } ] }
  Type list injected from maintenance-types.json. Parser tolerates
  markdown fences; rejects malformed JSON.
- AI4 Result opens the visit form pre-filled; low-confidence /
  "other" items flagged; per-line computed next-due preview shown
  via nextDue.ts. Each item carries the PRT5 "not installed yet"
  toggle — a parts-shop receipt can stock the shelf instead of
  logging maintenance.
- AI5 Nothing written to Firestore until the user saves (dec. #21).

### AI intake — odometer (ODO)
- ODO1 "Snap odometer" on the car page / quick-update control.
- ODO2 Prompt contract: { odometer: number, confidence }. Main
  odometer only; ignore trip meters (stated in prompt).
- ODO3 Confirm screen old → new with delta; save via C9 monotonic
  path.
- ODO4 Reading LOWER than current = treated as misread: offer
  retake / type manually. Do NOT surface the monotonic override.

### AI failure & fallback matrix (both flows)
- Unreadable/blurry → "Couldn't read it — retake or enter manually."
- Quota exhausted → manual form + "Scan limit reached today."
- Malformed JSON / network error → manual form, console log only.
- Local dev: App Check debug provider token, documented in README.

### Language setting (I18N)
- I18N1 Settings gains a language selector: English (default),
  Bahasa Melayu, 中文. Applies immediately, no reload.
- I18N2 Persisted to users/{uid}.language in the user's own doc
  (own-doc write, no new rules surface beyond the field) + cached
  locally; on login the doc value wins. Never asked again.
- I18N3 Scope = UI strings only: nav, buttons, forms, empty states,
  errors, due statuses, settings, code-gate copy, notification
  sentences, maintenance-type PRESET display names (via i18n keys
  in/alongside maintenance-types.json). User input (car names,
  notes, custom type names, workshop) is shown verbatim, always.
- I18N4 Retrofit: all existing Phase 1+2 strings extracted to
  en/ms/zh dictionaries. Claude Code extracts + drafts ms/zh;
  Shirley reviews translations (they're what the family reads).
- I18N5 Notifications render from { type, params } at display time
  in the reader's language. ⟨VERIFY current notification docs store
  type + params, not pre-rendered text — if text, migrate as part
  of this work⟩
- I18N6 Dates/numbers: locale-aware date formatting; RM formatter
  unchanged (language-neutral). No layout rework expected (no RTL;
  spot-check longest ms strings on ~390px).

### Spend visualization (SPD)
- SPD1 New denorm fields: car.spendByType (typeId → RM) and
  group.spendByMonth (current year, "YYYY-MM" → RM). Updated in the
  SAME batch as every log create/edit/delete. Owner "Recalculate"
  rebuilds both (doubles as the one-time backfill).
- SPD2 Car page: donut by type from car.spendByType (replaces the
  loaded-logs computation — closes the partial-data honesty bug).
  Center label = total. Fixed token-derived type palette.
- SPD3 Group page: monthly bar (current year) from spendByMonth;
  per-car horizontal bar from existing car.totalSpend.
- SPD4 Charts read denormalized docs only — ZERO log-history reads.
- SPD5 recharts, lazy-loaded; nothing chart-related in the main
  bundle. No gridline clutter; shared RM formatter; friendly empty
  state, not an empty axis.
- SPD6 Home strip unchanged (numbers only).

## 5. Data model changes

- app/config — new/extended: aiModel, optional scan feature flag.
- cars/{carId}: + spendByType. groups/{gid}: + spendByMonth.
- users/{uid}: + language ("en" | "ms" | "zh").
- cars/{carId}/parts — new subcollection (PRT1).
- No rules relaxation anywhere; only additions. Rules must accept
  the new fields in the log-write batch shape (update + deploy +
  emulator test).

## 6. Open decisions

None. All previously open items concerned access codes and limits,
both cut (decision #26). Every task can start.
