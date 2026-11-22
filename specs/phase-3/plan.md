# Phase 3 — Plan

> How spec.md gets built: architecture choices, sequencing rationale,
> risk gates. Execution checklist lives in tasks.md.

## 1. Build order & why

T17 visit form → T18 parts shelf → T19 i18n → T20 spend viz →
T21 AI Studio gate → T22 receipt scan → T23 odometer snap → T24
wrap-up.

- **Visit form first**: standalone value with zero AI, and its draft
  object (V4) is the interface AI intake fills — AI becomes an input
  method, not a feature. Its batched write (V2) is also where the
  new spend maps live, so spend viz sequences after it (touch that
  batch once, not twice).
- **i18n early (T18)**: the retrofit cost compounds with every
  feature shipped un-extracted. From T17 onward all new strings go
  through t() (CLAUDE.md rule), so T18's retrofit covers only
  pre-Phase-3 code, and everything after T18 is translated by
  construction.
- **Parts shelf immediately after the visit form**: install (PRT4)
  and the shelf toggle (PRT5) are both faces of the same draft
  object and batched write — building them together avoids
  touching that batch twice. Its strings already flow through t()
  (T17's CLAUDE.md rule), so sitting before i18n costs nothing.
- **All non-AI scope (T17–T20) finishes before any AI code**:
  logging, shelf, languages, and charts ship even if AI slips.
- **T21 gates the AI spend before it happens** (see §4). T23 rides
  entirely on T22's plumbing and only proceeds if its gate passed.

## 2. Architecture notes

### Parts shelf
- Install is the visit form with a pre-filled draft + one extra
  batch write (part status flip) — no new form, no new write path.
- Spend-at-install (dec. #25) keeps Recalculate logs-only; the
  shelf value line is computed from the parts subcollection with a
  bounded query (status == on_hand, limit()).
- Status transition enforced in rules as batch shape (part update
  valid only alongside its log create), same technique as every
  other denorm batch.

### AI intake
- Firebase AI Logic JS SDK with the **Gemini Developer API** backend
  (Spark-compatible; the Vertex AI backend is Blaze — do not pick
  it in the console). App Check is part of the guided setup; local
  dev needs the debug provider token (README).
- Model id read from app/config.aiModel at call time (dec. #22).
- Image path reuses the Phase 2 photo pipeline before the call —
  same canvas resize/JPEG/HEIC/EXIF code, no new preprocessing.
- Responses parsed defensively: strip markdown fences, JSON.parse
  in try/catch, validate shape (types must be known ids or
  "other"); any failure → manual form fallback, never an error
  wall. All three fallback branches (blurry, quota, malformed) are
  first-class UX states, not exceptions.
- Lazy-load the AI module (dynamic import) on first scan tap;
  nothing AI-related in the main bundle.

### i18n
- react-i18next (or an equivalently thin hand-rolled t() + JSON
  dictionaries — implementer's call; string count is small).
  Dictionaries en/ms/zh code-split per language.
- Language state: users/{uid}.language is the source of truth;
  local cache covers pre-auth screens; doc value wins on login.
- Notification sentences are i18n templates keyed by type with
  params interpolated at render — this is why stored notifications
  must be { type, params } (I18N5 ⟨VERIFY⟩; migrate if not).
- Preset maintenance-type names resolve through i18n keys; custom
  types and all user input render verbatim.
- The ms/zh vocabulary written here (minyak enjin / 机油 etc.) is
  reusable in the AI receipt prompt's type-matching later.

### Spend viz
- Denorm-only reads (SPD4): charts cost zero extra Firestore reads,
  which is the entire reason charts are now allowed (dec. #23) —
  charting from log history would be the Spark-tier read-
  amplification trap.
- Edit/delete must subtract-old-then-add-new on both maps; the
  extended Recalculate is both the self-heal and the backfill for
  pre-Phase-3 logs.
- recharts behind a lazy route/component boundary; palette derived
  from existing tokens; status colors stay reserved for status.

## 3. Rules impact summary

New/changed rules: multi-log visit batch shape, new spend map
fields in car/group write shapes, users.language field, parts
subcollection (shape + install transition). No new
collections, no relaxations. Every change ends with
`firebase deploy --only firestore:rules` (the lesson), covered by
emulator tests before deploy.

## 4. Non-negotiable gates

- **G-C** Deep-link regression on a real phone (i18n touches every
  screen): fresh user scans QR → auth → verify → username → lands
  back on join page, in a non-English language.
- **G-D** Visit batch: multi-item save passes DEPLOYED rules;
  lastByType correct when the same type appears twice in one visit
  (later entry by date/odo wins).
- **G-E** AI accuracy gate, BEFORE any AI code (~30 min in Google
  AI Studio): draft prompts vs ≥5 real family receipts + ≥3 real
  dashboard photos. Receipt: majority of items typed correctly.
  Odometer: 8/10 correct or T23 is cut / flagged off. Same
  discipline as the CarImages 2h gate.
- **G-F** Quota-exhausted and malformed-JSON paths manually
  verified (mock the failure) — fallbacks feel like normal UX.
- **G-G** Spend-viz zero-drift: after Recalculate, spendByType and
  spendByMonth match a hand-computed sum over ALL logs for one real
  car with >20 logs; edit AND delete update both maps correctly.
- **G-I** Parts shelf: on-hand part moves NO timer/bar/denorm;
  install starts the timer from install date/odo (not purchase
  date) and counts spend exactly once (Recalculate agrees);
  rules deny a status flip without its log in the same batch;
  deleting the linked log reverts the part to on_hand.
- **G-H** i18n: language survives logout → login and a second
  device; a notification triggered by an English-preference user
  renders in Chinese for a Chinese-preference reader; key screens
  spot-checked in all three languages at ~390px (longest ms
  strings don't break layout); Shirley has reviewed ms/zh
  dictionaries before ship.

## 5. Risks & mitigations

- **AI accuracy on worst inputs** (handwritten bil tunai, night
  dashboard photos): absorbed by draft-then-confirm — a bad read
  costs the user seconds, never bad data. Expectation: "saves
  typing most of the time," not "always works."
- **Free-tier quota/model churn**: quota fallback is a designed
  state; model id in config so churn is a console edit, not a
  deploy.
- **Rules shape drift** (bit us twice): every batch change pairs
  with emulator tests + deploy in the same task.
- **Onboarding regression**: i18n rewires strings on every screen
  in the sacred /join path — G-C exists precisely for this.
- **Ungated sign-up**: accepted risk (dec. #26). Counters stay
  maintained; if abuse appears, caps return as a small rules-only
  task with zero migration.
- **String drift after T18**: a new hardcoded English string
  silently breaks trilingual coverage. Mitigation: the CLAUDE.md
  t() rule + a grep-for-literal-strings check in the wrap-up task.

## 6. Out of scope for this plan

Landing page, access codes, group/car limits (cut, dec. #26).
km/day projection (dec. #15). Push/FCM (D5). Custom domain.
