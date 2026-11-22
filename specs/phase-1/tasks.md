# Phase 1 Tasks — Build Order (React / Web-only)

Work top to bottom. Each task is testable before the next. Reference spec IDs in commits.

## T0 — Prerequisites (human, one-time)
The repo already exists as a working Create React App project with Firebase Auth wired up. **Do not scaffold a new project** — T1 migrates this one.

- [x] React app exists, `firebase@12` installed, `.env` populated with the 7 Firebase keys (renamed to `VITE_FIREBASE_*` in T1; project `car-log-project`).
- [x] Firebase console: Email/Password + Google providers enabled (both work in the running app).
- [ ] Firebase console: **create the Cloud Firestore database**, enable Hosting. ⚠️ **Now blocking** — since T2, sign-up and social sign-in write `users/{uid}`, so without the database those writes fail.
- [ ] `firebase login` + `firebase use car-log-project`. **`firebase.json` already exists** (hosting → `dist`, SPA rewrite, firestore rules, emulator ports) — if you run `firebase init`, do not let it overwrite `firebase.json`, `firestore.rules` or `index.html`.
- [x] **Write `specs/phase-1/spec.md`.** Auth (A1, A3–A9) and S3 are written; A6 and A8 are owner-authored, the rest reconstructed and awaiting review. G/N/D and S1–S2 still need authoring.
- [ ] Optional: add mockups at `specs/design/`. Absent that, the built auth screen is the design reference.

## T1 — Migrate CRA → Vite + TypeScript, extract design tokens
Mechanical migration of existing source. **Preserve all existing components, pages, controllers, contexts and CSS** — no behavior changes, no restructuring beyond file extensions.

**Build tool**
- [x] Remove `react-scripts`; add `vite`, `@vitejs/plugin-react`; create `vite.config.ts`. Rewrite npm scripts (`dev`/`build`/`preview`/`test`).
- [x] Move `public/index.html` → `index.html` at repo root; drop `%PUBLIC_URL%`; add `<script type="module" src="/src/main.tsx">`. Keep the rest of `public/` as static assets.
- [x] Rename `src/index.js` → `src/main.tsx`.
- [x] `.env`: rename all 7 keys `REACT_APP_FIREBASE_*` → `VITE_FIREBASE_*`; switch `firebase-config` to `import.meta.env`. Commit a `.env.example` with the key names and empty values.
- [ ] Verify the app still runs in a browser: login, register, Google sign-in, toasts, sign-out. (Build/lint/typecheck/tests are green; browser pass still owed.)

**TypeScript**
- [x] Add `tsconfig.json` (strict), `@types/react`, `@types/react-dom`. Rename the ~21 source files to `.ts` / `.tsx` (JSX must be `.tsx`).
- [x] Convert `model/User.js`'s JSDoc `@typedef UserProfile` into a real `interface`; type `DEFAULT_USER` against it.
- [x] Type the context values (`UserContext` currently `createContext()` with no default), `useAuthController`'s return, `AuthTextField`'s props, and the toast array.
- [x] `tsc --noEmit` + ESLint clean.

**Design tokens**
- [x] Create `src/styles/tokens.css` with the colors/radii/shadows listed in plan.md § Design system; import once from `main.tsx`.
- [x] Replace hardcoded hex in `LoginRegister.css`, `AuthTextField.css`, `GoogleButton.css`, `ToastMessage.css` with `var(--…)`. No visual change.
- [x] Move `HomePage`'s inline styles and `App.tsx`'s loading-state inline styles into `HomePage.css` / a stylesheet.

**Routing**
- [x] Add `react-router`; replace `App.tsx`'s truthy-`user` component swap with real routes (`/`, `/login`), keeping the `isAuthLoading` guard. Needed before T5's `/join/:groupId/:token` deep link can exist.

**Cleanup (safe deletions only)**
- [x] Delete CRA leftovers: `App.css`, `logo.svg`, `reportWebVitals`, the stale `App.test.js` (it asserts "learn react" and fails).
- [x] Delete `controller/AuthAccessPage.js` (dead — superseded by `App.js`) and the empty `Profile/ProfilePage.{js,css}`, `HomePage/HomePage.css` placeholders.
- [x] Set up Vitest + Testing Library in place of CRA's Jest.
- [x] Optional: rename `pages/LoginrRegister/` → `pages/LoginRegister/` (typo). If done, update CLAUDE.md § Structure to match.

**Known issues to fold in while migrating** (documented in plan.md)
- [x] Consolidate the duplicate `onAuthStateChanged` listener (`AuthController` + `UserContext`) into `UserContext` alone.
- [x] Collapse duplicated validation (page + controller) into the controller.
- [x] Delete the unreachable `login_register/*` error branches in `LoginRegister` (Firebase emits `auth/*`, and the controller never rethrows).
- [x] Fix `firebaseErrorMapper`'s weak-password copy: says "6 characters", `PASSWORD_REGEX` requires 8+ with a digit.
- [x] Decide the app name: `locale/English` says **"CarLog"**, the docs say **"Journey Care"**. Make them agree.

## T2 — Auth [A1, A3–A9] (A2 removed — no Facebook)
Extends the existing auth screen — see plan.md § Auth flow for what's already working.

- [x] Single auth screen with Login / Sign Up segmented toggle. Built (`pages/LoginRegister/`).
- [x] Inline per-field validation, friendly errors via `firebaseErrorMapper` + toasts, password show/hide.
- [x] Sign Up: **add confirm-password field** (email + password + confirm only — no username, see A6); send verification email; route to gate. [A3]
- [x] Verify-email gate: shows target email, Resend (60s cooldown), "I've verified" reload, sign out. [A4]
- [x] Login: unverified → gate; wire the existing **Forgot Password** link (currently `href="#"`) to a reset email. [A3, A7]
- [x] Google sign-in via `signInWithPopup`. [A1]
- [x] Google: add redirect fallback on popup block; skip gate. [A5]
- [x] Auth routing incl. /join/* redirect-and-return groundwork. [A9]
- [x] One-time username screen on first entry; sole writer of `users/{uid}` {username, email, createdAt}; prefills social display name but requires explicit confirmation; accounts that already have a username skip it. [A6]
- [x] firestore.rules: users/{uid} self-only [S3]. Emulator test.

## T3 — Home shell [H1–H6]
- [x] Post-login layout with top bar (logo + name), bell placeholder (no badge — T7), sign-out. [H1]
- [x] Groups list via onSnapshot (memberIds array-contains uid); name + member count cards; whole card routes to /groups/:groupId. [H2, H4]
- [x] Create/join entry points, on both the populated list and the empty state. [H3]
- [x] Empty state card — no illustration, carries both actions. [H5]
- [x] Layout reserves an invisible slot above the list for Phase 2 summary cards. [H6]
- [x] Read-only `groups` rule so H2's query works (member-only read); emulator tests. **Partial S1 — writes still denied, T4 owns them.**

## T4 — Groups core [G1, G2, G11]
- [x] Create group — name 1-50 chars, creator seeded as sole member/owner, joinToken generated. [G1]
- [x] Group detail at /groups/:groupId — live name + member list, owner marked, not-found state for non-members. [G2]
- [x] Owner-only delete behind an explicit confirm step. [G11]
- [x] Rules for groups **writes** per S1 (member-only read landed in T3); emulator tests.

## T5 — Join flow [G3–G7, S2]
- [x] Owner screen with QR (qrcode.react) + copyable link + typeable code. Owner-only. (joinToken generated on create — T4 [G1].) [G3, G4]
- [x] /join/:groupId/:token route → request-to-join → pending joinRequest; distinct messages for invalid / already-member / already-pending. [G5]
- [x] Phone-browser camera scanning (feature-detected, lazy-loaded); paste-link path everywhere. Scanning only navigates. [G4]
- [x] Owner's pending list; Accept as a single batched write, Decline sets status. [G6, G7]
- [x] Rules + emulator tests proving a requester cannot self-join — 30 join tests incl. all five required attack cases. [S2]

## T6 — Member management [G8–G10]
- [ ] Management panel: member list, roles, remove member; access-change plumbing ready for per-car columns in Phase 2.

## T7 — Notifications [N1–N5]
- [x] Notification writes wired into join / accept / decline / owner-removal — each in the triggering action's own batch. (Per-car access-change lands with cars in Phase 2.) [N1]
- [x] Bell + unread badge (exact to 99, then 99+) via a bounded onSnapshot. [N2]
- [x] List screen: newest first, paginated with Load older, empty state; mark read per item on tap + Mark all read. [N3, N4]
- [x] Own-subtree-only rules with three narrow cross-write shapes; 26 emulator tests. [N5]

## T8 — Hardening & deploy
- [ ] Full rules pass, default deny.
- [ ] Vitest: auth form validation + routing; rules test suite green.
- [ ] `npm run build`; `firebase deploy`; smoke test the live .web.app URL on desktop + a phone browser (incl. QR scan on the phone).
- [ ] Family onboarding: real group, real join via QR.

## Done means
A1, A3–A9, H1–H5, G1–G11, N1–N5, D1–D4, S1–S3 working on the deployed site, rules emulator-tested, responsive on phone browsers.
