# Phase 3 — HANDOFF (to Shirley)

Everything that needs a human — you, Shirley — before Phase 3 is truly
shipped. Claude Code executed T17–T24 autonomously against your spec but
these items either need eyes on translations, live-device verification,
or Firebase console work that only you can do.

Read this end-to-end, tick each item, then Phase 3 is done.

---

## 1. Firebase console: enable AI Logic + App Check

**Do these before T21 (AI Studio gate) and again before enabling
`scanEnabled` in `app/config`.**

### AI Logic — Gemini Developer API backend

1. Open the Firebase console → your project (`car-log-project`).
2. **Build → AI Logic → Get started**.
3. When asked to choose a backend, **pick "Gemini Developer API"**, NOT
   "Vertex AI in Firebase". The latter requires Blaze billing; the
   former is free-tier compatible and needs no card.
4. The guided setup will offer to enable **App Check** — say YES. Pick
   reCAPTCHA v3 for the web provider (default).
5. When you finish, note the model id currently offered (e.g.
   `gemini-2.5-flash`). You'll use this in step 3 below.

### App Check — local debug token (for dev)

1. In the console, **Build → App Check → Apps → Web app**.
2. Under **Manage debug tokens**, click **Add debug token**.
3. Give it a name like "Shirley's laptop dev".
4. Copy the UUID it generates.
5. On your dev machine, add to `.env.local` (create if missing):
   ```
   VITE_APP_CHECK_DEBUG_TOKEN=<paste the UUID>
   ```
6. This file is gitignored — the token is per-device.

If you run into "AppCheck token is invalid" errors during T21 or T22,
this is the fix.

---

## 2. T21 — AI Studio accuracy gate (30 minutes)

You must run this in Google AI Studio (aistudio.google.com) BEFORE enabling
`scanEnabled` for the family.

### The prompts to test (paste these verbatim into AI Studio)

**Receipt prompt** — for the AI intake receipt scan:

```
You are an assistant reading a maintenance receipt for a car in Malaysia.
Return facts as JSON only — no prose, no explanation, no markdown fences.
The JSON must match exactly this shape:

{
  "date": "YYYY-MM-DD" | null,
  "odometer": number | null,
  "workshop": string | null,
  "items": [
    {
      "type": "<one of the ids below | \"other\">",
      "rawText": "<the exact line item text from the receipt>",
      "cost": number,
      "confidence": "high" | "low"
    }
  ]
}

Valid `type` ids (from maintenance-types.json):
  engine_oil, oil_filter, air_filter, cabin_filter, fuel_filter,
  brake_pads, brake_fluid, brake_disc, coolant, spark_plug,
  timing_belt, transmission_fluid, tyre, wiper_blades, battery,
  wheel_alignment, tyre_rotation, aircon_service, inspection, custom

Rules:
- Use "other" only when nothing matches — do NOT guess a similar one.
- `cost` is in Malaysian Ringgit as a number (e.g. 250.5 for RM 250.50).
- `date` follows the receipt's date, converted to YYYY-MM-DD.
- `odometer` is the car's reading at service, in kilometres, if visible.
- `confidence: "low"` when the line is ambiguous, hand-written, or the
  cost is unclear.
- Return an empty items list if no maintenance items are visible.

The receipt image will be provided as the next input. Return only valid JSON.
```

**Odometer prompt** — for the odometer snap:

```
You are reading a car's odometer from a dashboard photo. Return JSON only.
Shape:

{ "odometer": number, "confidence": "high" | "low" }

Rules:
- Read the MAIN odometer only. Ignore trip meters (usually smaller,
  labelled TRIP A / TRIP B, and often show one decimal place).
- Return the number in kilometres, as an integer.
- Confidence "low" when the reading is partly obscured, sun-flared,
  or two digits are ambiguous.
- If you cannot read the main odometer at all, return
  { "odometer": 0, "confidence": "low" }.

The dashboard image will be provided as the next input. Return only valid JSON.
```

### What to test

Feed the receipt prompt (in AI Studio, model `gemini-2.5-flash` first) with:
- **≥5 real receipts** from Malaysian workshops. Cover: printed carbon-copy
  bil tunai, thermal-printer receipts, a hand-written one, one with tips
  or discounts, one with multiple items.
- Save the response JSON for each. Note whether:
  - `type` id is correct for each line (or defensibly "other")
  - `cost` is right (RM value)
  - `date` is right
  - Which lines came back `confidence: "low"` — do they match your gut?

Feed the odometer prompt with **≥3 real dashboard photos**. Cover: bright
day, dim garage, a needle+digital dashboard, a full-digital one. Note:
- Was the number correct?
- Was the confidence flag reasonable?

### Pass criteria

- **Receipt**: majority of items typed correctly (see spec.md § G-E).
- **Odometer**: 8 out of 10 correct (see spec.md § G-E).

If either fails: try `gemini-2.5-pro` (slightly slower, more accurate).
If pro also fails, T23 (odometer) is CUT — leave `scanEnabled: false`
and defer AI intake to a future phase.

### After the gate

Update `src/app/config.ts`:
- `aiModel`: set to the winning model id (e.g. `"gemini-2.5-flash"`).
- `scanEnabled`: change to `true`.

Commit and deploy. The family can now use the scan buttons.

---

## 3. Translations pending review — Malay + Chinese

Two files need your eyes:

- `src/locale/Malay.ts` — **PENDING SHIRLEY REVIEW**. Drafted against
  the vocabulary in spec.md (minyak enjin, bengkel, tayar, etc.).
- `src/locale/Chinese.ts` — **PENDING SHIRLEY REVIEW**. Simplified
  Chinese, drafted against the same vocabulary (机油, 车厂, 轮胎, etc.).

Both are PARTIAL dictionaries. Any string missing from them falls back
to the English equivalent via `mergeLocale` — so the family sees no
`undefined` labels while you review, they just see some English mixed in.

### Terms Claude was unsure about

Please double-check these before shipping:

- **Bahasa Melayu**
  - "Journey Care" — kept as English brand name. OK?
  - "Log a visit" → "Rekod satu lawatan" — literal, but "visit" in
    the workshop context could be "lawatan bengkel" too. Preference?
  - "Parts shelf" → "Rak alat ganti". Is "alat ganti" (spare parts)
    right or would you use "bahagian" (parts)?
  - "Buy for later (adds to parts shelf)" — the whole toggle
    sentence could be tightened.
  - The greeting variants ("Selamat pagi/petang/malam") — verify
    coverage matches how your family actually greets.

- **中文**
  - "Journey Care" — kept as English. Or would you translate?
  - "Log a visit" → "记录一次进店" — check the wording feels natural.
  - "Parts shelf" → "零件架" (literally "parts rack"). Alternatives:
    "零件库存" (parts inventory)?
  - "Fix totals" → "修正总额" — check this doesn't sound alarming.
  - Whether Traditional (繁体) is preferred over Simplified (简体);
    the draft is Simplified.

### How to review

1. Open each file in the editor.
2. Skim through each section — the section names match English's
   structure (`login`, `home`, `groups`, `cars`, `logs`, `parts`,
   `spend`, `settings`, `notifications`, `members`, `common`, `errors`).
3. Fix anything that reads awkwardly. Keep the JSON keys unchanged
   (they're what the code looks up); only edit the string values.
4. Commit when you're happy. No rules deploy needed — these are
   local strings.

---

## 4. Non-automatable gates

Some Phase 3 gates need a live device, a real phone, or a live model
call. Claude ran everything automatable; these are what's left.

### G-C — /join deep-link regression, real phone, non-English

**One-time test after T19 lands:**
1. Sign OUT of the app on your phone. Also clear localStorage
   (or use an incognito window).
2. Open the Settings on a sample account first, set language to Malay
   (or Chinese) so the LocalStorage cache remembers it.
3. Sign out.
4. Have someone else send you an invite QR / link to a group they own.
5. Scan / open the link on the phone.
6. Expected flow, ALL screens in the non-English language:
   - `/join/:groupId/:token` → "Sertai kumpulan" heading
   - Auth screen → "Log Masuk" / "Daftar"
   - Sign in / register
   - Verify-email gate (if email/password) → "Periksa peti masuk anda"
   - Choose-username screen → "Nak kami panggil awak apa?"
   - Lands back on /join/:groupId/:token → "Sertai kumpulan"
   - Tap "Mohon sertai"
7. Have the owner accept.
8. Verify the accepted notification appears in the non-English language.

### G-E — AI accuracy gate

See section 2 above.

### G-F — quota-exhausted and malformed-JSON paths

**After T22 lands, once scanEnabled=true:**
1. Trigger `scanEnabled=true` mentally as if we're testing.
2. Scan a receipt normally — verify pre-fill works.
3. Now to test failure paths, temporarily edit the AI receipt module
   (`src/lib/aiReceipt.ts`) to throw specific errors:
   - Throw `new Error("QUOTA_EXHAUSTED")` from the sync path and
     verify the "Scan limit reached today" toast + manual form
     appears.
   - Throw a JSON parse error and verify the manual form appears
     with a console warn but no scary alert.
4. Revert the edits and commit.

### G-H — i18n persistence, cross-device, notification reader-language

1. Set your account's language to Malay on device A. Sign out.
2. Sign in on device B (a different browser). Verify UI is in Malay
   without touching Settings.
3. Have another account (English) trigger a due-notice notification
   about your car. Verify it renders in Malay on your phone — the
   date should be formatted in the Malay locale, not the sender's.
4. Widths: at ~390px (iPhone Safari), spot-check the longest ms
   strings — they shouldn't overflow the panel.

Known limitation:
- Notifications written BEFORE T19 shipped still render their
  point-in-time `dueLabel` string (frozen in the sender's language).
  This is intentional — see CONTEXT.md § I18N5 rendering. New
  notifications carry raw `dueDateMs`/`dueKm` and render in the
  reader's language.

### T20 — real >20-log car zero-drift check

**After T20 lands:**
1. On a real car with more than 20 logs (create a test group and add
   fake logs if you don't have one), run "Fix totals".
2. Note the "corrected N" or "everything already agreed" message.
3. Edit one log (change the date to cross a year boundary, or change
   its type). Watch the totals update live on the group's dashboard.
4. Delete a log. Watch the totals update.
5. Run "Fix totals" again — it should report "everything already
   agreed", not "corrected N", if T20 is working.

---

## Full report — see main summary

The T24 wrap-up prints a per-task summary with commit hashes.
This file has the human ledger.
