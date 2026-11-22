# Phase 2 Plan — Technical Approach

## Data model additions
```
groups/{groupId}
  + carCount: number                     // P3a, batch-maintained

groups/{groupId}/cars/{carId}
  brand, model, year                     // from bundled list (strings; "Other" allows free text)
  nickname?, plate?, odometer?: number
  imageUrl?: string                      // cached CarImages URL (C4)
  photo?: string                         // base64 JPEG <= ~250KB (C5/D4) — replaces imageUrl in UI
  access: { uid: 'edit' }                // C6; owner+creator implicit
  lastByType: { typeId: {date, odometer?, intervalKm?, intervalMonths?} }   // denormalized for next-due
  totalSpend: number                     // denormalized for dashboards
  statusStamp: { typeId: 'due_soon'|'overdue' }   // notification dedupe (R4)
  createdBy, createdAt

groups/{groupId}/cars/{carId}/logs/{logId}
  type: string                           // preset id or 'custom'
  customLabel?: string
  cost: number                           // RM
  date: Timestamp
  odometer?: number
  intervalKm?: number, intervalMonths?: number   // resolved at log time (L4)
  notes?: string
  createdBy: { uid, username }, createdAt

users/{uid}
  + groupsOwned: number                  // P3b

groups/{groupId}
  + spendByYear: { '2026': number }      // denormalized for home strip
```

## Static data (bundled, no APIs for car specs)
- src/data/cars-my.json: brand → models → year-range. Hand-curated MY-popular set (Perodua, Proton, Toyota, Honda, Mazda, Nissan, Mitsubishi, BMW, Mercedes-Benz) + "Other" free-text escape.
- src/data/maintenance-types.json: preset types + default intervals per L3.

## Car images (C4) — strict timebox
- CarImages API (free tier), called once at car creation; resolved URL cached on the doc; failure = placeholder silently, never blocks creation.
- 2h decision gate (CONTEXT.md): if Perodua/Proton don't resolve during implementation, ship placeholder+own-photo only, remove the API call, record the outcome in CONTEXT.md.

## Own photos WITHOUT Firebase Storage (D4)
- Client-side: canvas resize to max 1280px long edge, JPEG quality stepped down until <= 250KB; stored as data-URL string in car.photo.
- Why: Firebase Storage requires Blaze for new projects (late-2024 change) — violates zero-cost. Firestore doc limit is 1MB; 250KB photo + fields fits safely.
- Rules guard: reject car writes where photo exceeds ~350KB (S6).
- UI precedence: photo ?? imageUrl ?? placeholder.

## Rules strategy (the Phase 2 core)
- Helpers: isMember(gid), isOwner(gid), carEdit = uid in car.access=='edit' || uid == car.createdBy || isOwner.
- cars: read isMember; create isOwner || uid in group.canAddCars (get()) with shape validation (createdBy == auth.uid, honest carCount increment in the same batch); update: detail/odometer by carEdit, access-map changes owner-only (field-level diff().affectedKeys check); delete owner||creator with honest carCount decrement; logs cascade-deleted client-side.
- logs: read isMember; write by carEdit (get() parent car); shape: cost >= 0, date <= now, createdBy.uid == auth.uid; lastByType/totalSpend/spendByYear updated in the SAME batch (rules validate presence, loose numeric honesty — family-trust scale).
- Odometer monotonic (C9): decreases require an explicit override flag; UI confirms.
- Emulator tests: all allows + attack cases (non-member reads car DENIED; no-edit member writes log DENIED; non-owner edits access map DENIED; oversized photo DENIED; dishonest carCount DENIED; forged createdBy DENIED).

## Next-due computation (R1–R3)
- Pure client lib src/lib/nextDue.ts: car.lastByType + car.odometer → per-type {dueDate?, dueKm?, status OK|DUE_SOON|OVERDUE} (thresholds 30 days / 1,000 km). Vitest-covered (no interval, no odometer, whichever-first, overrides).
- lastByType denormalization means status needs NO log-history reads — home and group badges stay read-cheap (CONTEXT.md read-amplification lesson). Log edits/deletes recompute lastByType client-side for the affected type (bounded query: that type's latest entries).
- R4: when rendering computes a status transition vs car.statusStamp, write the notification + updated stamp in one batch — one notification per transition, no spam.

## Spend totals (S1–S3)
- Car page: sum from loaded log history. Group/home: car.totalSpend and group.spendByYear delta-updated in log write batches.
- Self-heal: owner-only "Recalculate totals" action on group page (single full read pass, rewrites counters) for drift.

## Settings (SET1–2)
- Extend the profile area into /settings: display name (existing), email read-only, sign out, version from package.json.

## UI structure
- Group page = cars grid (C10) + "What's due" section (R3). Car page: photo header, details, odometer quick-update, next-due list, spend summary, log history + add-log button. Add-log form: type picker, cost, date, odometer, interval editor prefilled (L4), notes.
- Access grid (C7): T6 panel gains car columns; cell toggle = edit on/off (owner only).
- Everything on the minimalist token system, mobile-first per polish-pass standards.

## Task order (tasks.md)
T9 static data + car CRUD + rules → T10 car page + odometer + photos/images (API gate decided here) → T11 access grid + rules → T12 logs CRUD + denormalizations + rules → T13 next-due lib + badges + surfacing → T14 spend displays + recalc → T15 notifications N6/N7 → T16 settings + hardening + deploy + CONTEXT.md update.
