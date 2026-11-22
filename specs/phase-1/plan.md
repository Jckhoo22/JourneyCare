# Phase 1 Plan — Technical Approach (React / Web-only)

## Architecture
- React 19 + TypeScript + Vite single-page app; plain CSS with tokens; react-router; Firebase SDK realtime listeners consumed through hooks and context (no TanStack Query).
- MVC-ish layout inherited from the existing codebase: `pages/` (render), `controller/` (logic hooks), `context/` (app state), `model/` (types), `components/` (presentational). See CLAUDE.md § Structure.
- Firebase: Auth, Firestore, Hosting. Initialized once in `src/configurations/firebase-config.ts`, reading the web config from `.env` as `import.meta.env.VITE_FIREBASE_*` (public identifiers; env is convenience, not secrecy). Keep `.env.example` committed.
- Web only. Responsive layouts; phone-browser camera for QR scanning; no native builds.

## Starting point — this repo is not greenfield
Auth UI already exists and works: the Login/Register segmented-toggle screen, `AuthTextField` (filled, left icon, uppercase label, password eye), `GoogleButton`, a toast system (`ToastProvider` + `ToastMessage`), `UserContext` session restore with an `isAuthLoading` flash guard, `firebaseErrorMapper`, validation regexes, and `locale/English`. Google sign-in and email/password register + sign-in are wired.

Not yet built: routing (currently a truthy-`user` component swap — no URLs), email verification, password reset, any Firestore usage, and any security rules. T1 migrates the existing source to Vite + TS; T2 extends the auth screen rather than rebuilding it.

## Data model (Firestore) — unchanged from the original plan
```
users/{uid}                    username, email, createdAt
groups/{groupId}               name, ownerId, createdAt,
                               memberIds: [uid], members: {uid: {username, joinedAt}},
                               canAddCars: [uid], joinToken
groups/{groupId}/cars/{carId}  (Phase 2) brand, model, year, imageUrl, customPhotoUrl,
                               odometer, access: {uid: 'view'|'edit'}, createdBy, createdAt
joinRequests/{requestId}       groupId, uid, username, status: pending|accepted|declined, createdAt
notifications/{uid}/items/{id} type, payload, read, createdAt
```
- `memberIds` array exists because Firestore can't query map keys ("list my groups" = array-contains).
- Per-car access lives on the car doc.

## The privileged "accept" step — constrained security rules (no Cloud Functions)
- Anyone signed in may create a joinRequest for themselves (`request.auth.uid == uid`, status pending) when presenting a valid groupId+token (validated via `get()` on the group).
- Only the group owner may update a request's status.
- Membership writes to the group doc (adding one uid to memberIds/members) are owner-only; the owner's Accept performs a **batched write** updating both the group and the request.
- Net effect: a requester can never write themselves into a group. Migrate to a Cloud Function later only if rules grow painful.

## Showing an invitee the group name — the `public/info` window
- **Problem found in real-phone testing:** the join screen read `groups/{groupId}` to show the group's name, but that document is members-only (S1). An invitee is by definition not a member, so every genuine invite failed with `permission-denied` — surfaced to the user as an invalid/expired link. The rules were right; the client was asking for something it could never have.
- **Fix:** a narrow public window at **`groups/{groupId}/public/info` = `{name, ownerId}`**, readable by any signed-in user, writable only by the owner. The join screen reads that for the name. Reading it requires already knowing the group's auto-ID, which only ever comes from an invite link.
- **The token is not in that window and must never be.** It stays on the group document, where only members can read it, and is verified by the `joinRequests` create rule via `get()` — which is not bound by client read rules. So possession of the invite link remains the only way to request.
- Consequence: the client can no longer pre-validate the token. A wrong token is refused at submit time by the rules and reported as such. This is deliberate — the rules are the single authority on the token, and the alternative (mirroring a token hash into the public window) would let it be brute-forced offline.
- Membership is now detected by *probing* `groups/{groupId}`: succeeding at that read is exactly what being a member means.
- Written in the same batch as the group at creation, and re-asserted by the owner's Invite panel, which heals groups predating this window and re-syncs the name after a rename.
- **Join tokens never expire (G3).** No expiry concept exists anywhere in the code, and no error message may imply one.

## Join token & QR
- 20+ char random token on the group doc; QR rendered client-side (`qrcode.react`) encoding `https://<app-host>/join/<groupId>/<token>`; the same URL shown as copyable text.
- Route `/join/:groupId/:token` → shows group name → "Request to join" → creates joinRequest. If signed out, redirect to auth and return.
- QR scanning in phone browsers via a getUserMedia scanner lib (e.g. `@zxing/browser` or `html5-qrcode`); desktop uses the link/paste path. Feature-detect camera and degrade gracefully.

## Notifications
- Plain Firestore docs written by the triggering client action (join-request create writes the owner's notification; owner's accept/decline writes the requester's, in the same batch).
- Rules: users read/update only their own notifications subtree; creates allowed only alongside permitted triggering actions.
- Bell badge: onSnapshot listener on unread count; display caps at 99+.

## Auth flow
- Firebase Auth: email/password + `sendEmailVerification`; gate screen blocks until `user.emailVerified` (reload on "I've verified"). Google via signInWithPopup (fallback to redirect on popup block). **Email/password and Google are the only providers — no Apple, no Facebook, no phone. [A8]**
- **Username is collected on its own one-time screen, not at sign-up. [A6]** Sign Up asks for email + password + confirm only. Every account — email and social alike — passes through `pages/ChooseUsername/` on first entry (email: after verification; social: immediately after first sign-in) and picks a display name explicitly. That screen is the sole writer of `users/{uid}` `{username, email, createdAt}`.
  - Nothing derives a username from a provider display name. Google's display name is offered as an editable **prefill** only; the user still confirms it.
  - "Has a username" = the doc exists **and** `username` is a non-empty string. Anything less routes to the screen, so a half-written doc self-heals.
  - Because the doc is written after sign-in rather than during it, `UserContext` reads the profile but never creates one, and accounts that already have a username (including pre-A6 test accounts) pass through untouched.
- Single auth screen with a Login / Sign Up segmented toggle — **already built** in `src/pages/LoginRegister/`. Extend it; do not rebuild it.
- Auth logic lives in `controller/AuthController.ts` as `useAuthController()`; profile reads/writes live in `controller/userProfile.ts`. `UserContext` owns the only `onAuthStateChanged` listener.
- Routing is declarative: guards in `App.tsx` derive the destination from session state (signed out → `/auth`; unverified password account → `/verify-email`; no username → `/choose-username`; else home). The controller never navigates.
- Errors surface through `utils/firebaseErrorMapper` + the toast system, and inline per-field. Validation lives only in the controller.

## Design system
- Tokens as CSS custom properties in `src/styles/tokens.css`, extracted from the values already in use: orange primary (`#f97316` / `#ea580c` hover), slate text (`#0f172a`, `#475569`, `#94a3b8`), surfaces (`#ffffff`, `#f8fafc`, page `#F0F4F8`), error `#ef4444`, success `#10b981`, info `#3b82f6`. Radii: card 32px, field 8px, button 12px. Soft shadows; blue/orange blurred background blobs.
- Existing components are the primitives — `AuthTextField` (filled, icon, uppercase label, error state, password toggle), `GoogleButton` (provider), `ToastMessage`. Extend these; extract further primitives (page shell, card, primary button) from `LoginRegister.css` only when a second screen needs them.
- Components reference `var(--…)`; no raw hex outside `tokens.css`.
- **`specs/design/` does not exist in this repo.** The implemented auth screen is the working reference. Mockup images, if added later, supersede it.

## Testing & quality
- Security rules: unit tests with `@firebase/rules-unit-testing` against the Firestore emulator — membership, owner-only, self-join-prevention covered.
- Vitest + Testing Library for form validation and auth-routing behavior. (Replaces CRA's Jest in T1; the CRA stub `App.test.js` is stale and fails as written — delete it.)
- ESLint + `tsc --noEmit` clean at every task boundary.

## Deployment
- `npm run build` (Vite → `dist/`) → `firebase deploy` (Hosting + rules together) → free `<project>.web.app` URL. Set `firebase.json` `public` to `dist`, not `build`.
- SPA rewrite (all routes → index.html) in firebase.json so `/join/...` deep links work.
