# Phase 2 Spec — Cars, Maintenance Logs & Budgeting

## Scope statement
Phase 2 delivers the app's core purpose: cars inside groups, per-car access enforcement, maintenance logs with costs, next-due estimates, spend visibility, and a minimal settings area.
**Out of scope (Phase 3+):** landing page, access codes, group/car limits enforcement (fields prepared here), push notifications, km/day projection, delete account.

## Defaulted decisions — flip before build if wrong
- **D1 Spend scope:** home shows per-group total for the CURRENT YEAR; group page shows all-time + per-car breakdown. (Alternative: month, or all-time everywhere.)
- **D2 Settings contents:** profile (edit display name), sign out, app info. Delete account deferred to Phase 3 (requires data-cleanup design).
- **D3 km/day projection:** OUT. Next-due uses fixed interval from last service only. (Stretch item at the end if the week goes well.)
- **D4 Own car photos:** compressed client-side and stored IN the Firestore car doc (base64, hard cap ~250KB after compression). Firebase Storage is NOT used — it requires the Blaze plan for new projects, violating the zero-cost constraint. Verify once in console: if the Storage tab asks to upgrade, this default stands.
- **D5 Reminders:** in-app only (indicators + notification items). No push/FCM in Phase 2.

## 9. Cars
- C1 A car belongs to a group. Add-car is allowed for the group OWNER and members listed in the group's canAddCars permission. [confirmed earlier]
- C2 Car creation: pick brand → model → year from a BUNDLED static list (JSON shipped with the app; Malaysia-focused: Perodua, Proton, Toyota, Honda, Mazda, Nissan, Mitsubishi, BMW, Mercedes-Benz + free-text "Other" escape hatch for anything missing).
- C3 Optional fields: nickname (e.g. "Mum's Myvi"), plate number, current odometer (km).
- C4 After creation, attempt a car image from the CarImages API; cache the resolved URL on the car doc. STRICT TIMEBOX per CONTEXT.md: if MY models don't resolve, placeholder icon + own-photo path. Image failures must never block car creation.
- C5 Own photo: capture/upload, client-side compressed (max ~1280px, JPEG, target <= 250KB), stored in the car doc per D4; replaces the API image in all displays.
- C6 Per-car ACCESS enforcement (the Phase 1 model, now real):
  - Every group member can VIEW every car (view floor — confirmed earlier).
  - access map on the car doc: uid → 'edit'. Edit = modify car details, odometer, and manage that car's logs.
  - The car's creator and the group owner have edit implicitly; owner grants/revokes edit per member per car.
- C7 The members × cars ACCESS GRID (T6's panel) gains its car columns: owner toggles edit per member per car in one place.
- C8 Edit-car and delete-car: edit-access holders can edit; delete is owner-or-creator only, with confirm; deleting a car deletes its logs.
- C9 Odometer: manually updatable by edit-access holders from the car page; never decreases (validated, with an override confirm for corrections).
- C10 The group page (the "cars space" from the polish pass) lists the group's cars: photo/placeholder, name/nickname, plate, odometer, next-due summary badge.

## 10. Maintenance logs
- L1 Edit-access holders can add a log entry to a car.
- L2 Entry fields: type (from preset list + custom), cost (RM, >= 0), date (default today, not future), odometer at service (optional but encouraged), workshop/notes (optional free text).
- L3 Preset maintenance types shipped with the app, each with a default interval: Engine oil (10,000 km / 6 months), Oil filter (10,000 km / 6 months), Air filter (20,000 km / 12 months), Tires (50,000 km / 48 months), Battery (24 months), Brake pads (40,000 km), Brake fluid (24 months), Coolant (40,000 km / 24 months), Transmission fluid (40,000 km), Wipers (12 months), Aircond service (12 months), Alignment/balancing (10,000 km), Road tax & insurance (12 months), Inspection/service — general (10,000 km / 6 months), Custom (no default interval).
- L4 Intervals are per-entry editable at logging time (user can override the default: km, months, both = whichever-first, or none).
- L5 Entries: edit/delete by edit-access holders; every entry records createdBy (username shown in history).
- L6 Car page shows the full log history, newest first, with type, date, cost, odometer, who logged it.

## 11. Next-due & reminders
- R1 For each car and maintenance type with at least one logged entry carrying an interval: next due = last entry's date + months and/or last entry's odometer + km. Display "Due by <date>" / "Due at <km>" (both when whichever-first).
- R2 Status levels: OK / DUE SOON (within 30 days or 1,000 km) / OVERDUE (past date, or current odometer past due-km). Current odometer comes from C9.
- R3 Surfacing: badge on the car card (C10), a "What's due" section on the group page aggregating its cars, and a compact upcoming/overdue strip on HOME above the groups list (the slot reserved in T3).
- R4 In-app notification items (T7 system) generated client-side when a due item first crosses into DUE SOON or OVERDUE — at most one notification per car+type per status change (no daily spam). [No push in Phase 2 per D5.]
  - **R4a — amended in T13: EDIT holders, not viewers.** As drafted R4 said "for cars the user can view". Built narrower: a reminder goes to everyone holding edit on that car (owner, creator, explicit `access` grant), and to nobody else. A view-only member cannot log the service, book the workshop, or clear the reminder, so an item they can only dismiss is noise — and on a family group where one person owns everything, "everyone who can view" means notifying the whole group about a car they don't touch. Enforced on both ends in `firestore.rules` (`isDueNotice`): sender must hold edit, so a view-only member cannot manufacture reminders for other people; recipient must hold edit. Sender and recipient may be the same person — unlike every other notification type — because a car with a single edit holder is the common case and excluding the detector would mean nobody is ever told.
  - **R4b — the dedupe is a `statusStamp` map on the car.** `{ [type]: 'due_soon' | 'overdue' }`, recording the status each type was last NOTIFIED at; OK is absence. A render whose computed status already matches the stamp writes nothing at all. Notifications and the new stamp go in ONE batch, so a stamp can never move without its reminder. Recovering to OK drops the stamp silently — "you no longer need to do this" is not news, but the marker has to go or the next crossing would look like a repeat. Detection is pure and unit-tested: `detectChanges` / `nextStamp` in `src/lib/nextDue.ts`.
  - **R4c — one writer, on HOME.** `useDueNotifications` is mounted by `HomePage` only. Home already holds every group's cars, it is the screen the app opens on, and a single writer means the group and car pages can render status without racing each other to stamp it. Known gap: two devices opening the app in the same second can both detect a crossing before either stamp lands, producing a duplicate line. One round trip wide, cosmetic, deliberately not solved — a deterministic document id would collapse the duplicate but then collide when the same car+type crosses again next year.

## 12. Spend dashboard
- S1 Group page: total spent all-time + per-car totals; per-car page: that car's total + by-type breakdown.
- S2 Home: per-group spend for the current year (D1) in the summary strip.
- S3 All amounts in RM, formatted consistently; totals computed from logs client-side (family-scale data volumes — no aggregation infrastructure).

## 13. Settings (minimal, per D2)
- SET1 Reachable from the top bar (merge with the existing profile/display-name area).
- SET2 Contents: display name edit (exists), email shown (read-only), sign out, app version/about. Nothing else in Phase 2.

## 14. Notifications additions
- N6 access_changed: notify a member when their edit access on a car is granted/revoked (the Phase 1 N3 item deferred until cars existed).
- N7 due_soon / overdue per R4.

## 15. Phase 3 preparation (fields only, no enforcement)
- P3a groups/{gid}.carCount maintained (incremented/decremented in the same batch as car create/delete).
- P3b users/{uid}.groupsOwned maintained likewise on group create/delete.
- These exist because Firestore rules cannot count documents; Phase 3's limits validate against these counters.

## Security (extends S1–S3)
- S4 Car reads: group members only. Car writes: per C6/C8 (edit map, creator, owner) — enforced in rules, validated shape (access map only editable by owner; odometer/detail edits by edit-holders).
- S5 Log reads: group members. Log writes: edit-access on that car (rules get() the parent car).
- S6 Photo-in-doc size guard: rules reject car docs > ~300KB photo field (belt-and-braces with client compression).
- S7 Counter honesty: carCount/groupsOwned changes only alongside their triggering create/delete batches.
