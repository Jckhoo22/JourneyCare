# Phase 1 Spec — Requirements (React / Web-only)

Behavioural requirements for Phase 1. `plan.md` says *how*, `tasks.md` says *in
what order*; this file says *what must be true*.

> **Provenance — read before trusting this file.**
> This document did not exist while T1 and T2 were built; `tasks.md` cited IDs
> that were defined nowhere. **A6 below is authored by the project owner.** The
> rest of the A-series was reconstructed from `plan.md § Auth flow`, `tasks.md
> § T2`, and the behaviour actually shipped in `src/`. It is a faithful
> description of the current build, not an independently-authored requirement
> set — **review and correct it**, especially A9, whose scope was inferred.
> The G / N / D / S families are still unwritten apart from S3.

## A — Authentication

**A1 — Google sign-in.**
A user can sign in with Google from the auth screen via `signInWithPopup`. The
Google provider is enabled in the Firebase console.

**A2 — Removed.**
~~Facebook deferred.~~ Facebook sign-in is out of the project entirely; the
disabled button and its copy are gone. The ID is retained, not reused, so
references elsewhere stay unambiguous. See A8 for the provider scope that
replaces it.

**A3 — Email/password sign-up and sign-in.**
A single auth screen carries a Login / Sign Up segmented toggle.
- Sign Up collects **email, password and confirm-password only** (see A6 —
  username is *not* collected here).
- Login collects email and password.
- Both validate inline per field before any network call: email format,
  password strength (8+ characters including a digit), and on Sign Up that the
  two passwords match.
- Firebase errors surface as friendly copy via `firebaseErrorMapper`, both as a
  toast and, where field-specific, inline. Wrong password and unknown account
  return the same message deliberately, so the form cannot be used to probe
  which addresses are registered.
- Passwords have a show/hide toggle.

**A4 — Email verification gate.**
A newly registered email/password account is sent a verification link and is
held at a gate screen until it is verified. The gate shows the target address,
offers Resend on a 60-second cooldown, offers "I've verified" which re-reads the
user from the server, and offers a sign-out link. An unverified account that
signs in later lands back on the gate. Google accounts never see it (A5).

**A5 — Google redirect fallback, and skipping the gate.**
If the Google popup is blocked or unsupported, sign-in retries as a full-page
redirect. A user who closes the popup themselves is treated as cancelling, not
as a failure. Google accounts skip the verification gate — the provider has
already vouched for the address. Google is the only social provider (A8), so
this is the only path that skips A4.

**A6 — One-time username screen.**
Username is NOT collected at sign-up. On a user's first entry into the app
(email: after verification; Google/Facebook: first sign-in), a one-time username
screen asks them to choose a display name before proceeding to home. The
`users/{uid}` doc is created/completed there with `{username, email, createdAt}`.
Users with a username never see this screen again.

Clarifications settled during implementation:
- The wording above predates the removal of Facebook (A2). Read
  "Google/Facebook" as "Google" — it is the only social provider (A8). The
  requirement is otherwise unchanged.
- The screen is the *only* writer of `username`. Nothing derives a username from
  a provider display name. A Google user's display name is offered as a
  **prefill** they can edit, but they still confirm it explicitly.
- "Has a username" means the `users/{uid}` doc exists **and** its `username`
  field is a non-empty string. A doc missing either sends the user to the screen.
- Validation: trimmed length 3–20 characters. Any script is accepted, so
  non-Latin names are not rejected.
- Accounts that already hold a username — including test accounts created before
  this rule existed — pass straight through, untouched.

**A7 — Password reset.**
The auth screen's Forgot Password action sends a reset email to the address
typed in the email field. An empty or malformed address is refused inline
without sending anything.

**A8 — Provider scope.**
Email/password (A3) and Google (A1) are the only ways into the app. **No Apple,
no Facebook, no phone sign-in.** No other provider is offered, hinted at, or
left disabled in the UI, and no provider beyond Google is enabled in the
Firebase console. Adding one is a spec change, not an implementation detail.

**A9 — Session, routing and sign-out.** *(scope inferred — confirm)*
> Held A8 until Facebook was removed; moved here so A8 could carry the provider
> scope. Content unchanged, and nothing referenced it by ID.
- The session survives reload; the app shows a loading state until Firebase has
  restored or ruled out a session, so no login screen flashes.
- Route guards derive the destination from session state: signed out → auth;
  unverified email/password → gate (A4); no username → username screen (A6);
  otherwise home.
- A signed-out visitor to a protected URL is returned to it after signing in.
  This covers the `/join/:groupId/:token` invite deep link, which T5 depends on.
- Sign-out is available from the gate, the username screen and home, and returns
  the user to the auth screen.

## H — Home shell

> Authored from the owner's T3 brief. H5 and H6 are anchored by their explicit
> references ("empty state per H5", "Phase 2's summary cards (H6)"); the split of
> H1–H4 is mine — **review it**.

**H1 — Home shell and top bar.**
The signed-in landing screen carries a top bar with the Journey Care mark (the
same logo used on the auth card) and name on the left, and on the right a
notification bell and a sign-out control. The bell is a **placeholder in Phase 1
— no badge, no count, no unread logic**; T7 wires it (N1–N5). The screen uses
the established design system: tinted page with blurred blobs, white card
surfaces, orange accents.

**H2 — Groups list.**
The home screen lists the groups the signed-in user belongs to, queried as
`groups where memberIds array-contains uid` and kept live via `onSnapshot`, so a
membership change appears without a reload. Each group renders as a card showing
the group name and its member count.

**H3 — Create and join actions.**
Home offers two actions: **Create group** as the primary (orange) action and
**Join group** as the secondary. Both are reachable from the populated list and
from the empty state. Their destinations are built in T4 and T5.

**H4 — Group navigation.**
A group card is tappable across its whole surface and routes to
`/groups/:groupId`. The detail screen itself is T4 [G2].

**H5 — Empty state.**
A user with no groups sees a friendly card instead of an empty list — no
illustration — reading "No groups yet" with the guidance to create one for their
family or join with a code, and carrying the same two actions as H3.

**H6 — Summary slot.** *(Phase 2 — structure only)*
The layout reserves a region **above** the groups list for Phase 2's
spend/maintenance summary cards. In Phase 1 that region renders nothing and
occupies no space: no placeholder card, no reserved gap, nothing visible.

## G — Groups

> **Reconstructed, not briefed.** Unlike H, no brief was given for T4 — these
> are derived from `tasks.md § T4` ("create group (owner seeded); group detail;
> owner-only delete with confirm") and the data model in `plan.md`. Only G1, G2
> and G11 are written, because only those are in T4. **Review before T5.**

**G1 — Create a group.**
A signed-in user can create a group by giving it a name (1–50 characters after
trimming). The creator is seeded as the sole member and the owner: `ownerId` is
their uid, `memberIds` is `[uid]`, `members` holds their `{username, joinedAt}`,
and `canAddCars` is `[uid]`. A `joinToken` of at least 20 random characters is
generated at creation — T5's QR and invite link encode it. On success the user
lands on the new group's detail screen.

**G2 — Group detail.**
`/groups/:groupId` shows a group's name and its member list, live via
`onSnapshot`, with the owner marked. A user who is not a member cannot see it:
the rules deny the read (S1) and the screen shows a plain not-found state rather
than leaking whether that group exists. Per-car access columns arrive in Phase 2.

**G8 — Access is per car, not per group.**
Group membership grants visibility of the group and who is in it. It does **not**
grant access to any particular car: the owner elevates access car by car, and
that access lives on the car document as `access: {uid: 'view' | 'edit'}`
(Phase 2). `canAddCars` on the group is the separate, group-level right to add a
car at all.

The management panel is therefore a **members × cars grid**: one row per member,
one column per car, each cell holding that member's access to that car. Phase 1
has no cars, so the grid renders with its member column only — a plain list. The
component must accept car columns without being redesigned.

**G9 — Management panel.**
The group detail screen shows every member with their username, when they
joined, and whether they are Owner or Member. **All members see this list** —
knowing who you share a car with is the point of a group. Only the owner sees
management controls attached to it.

**G10 — Removing a member, and leaving.**
- The **owner** may remove any member other than themselves, behind an explicit
  confirmation. Removal is one batched write dropping the uid from `memberIds`
  and from the `members` map together, so the two can never disagree.
- A **member who is not the owner** may leave the group themselves, behind the
  same confirmation. Leaving is exactly a self-removal.
- The **owner cannot leave.** A group always has an owner; an owner who wants
  out deletes the group (G11). The UI offers them delete, not leave.
- Enforced by rules, not by hidden buttons: a member may remove **only
  themselves**, and may not remove anyone else (S1).
- A removed or departing user's group list updates live — their own
  `array-contains` query stops matching the moment the write commits.

**G11 — Owner-only delete.**
Only the owner sees a delete control, and deleting requires an explicit
confirmation step — never a single click. Deletion removes the group document
and returns the user home. Non-owners are refused by the rules, not merely by
the absence of a button (S1).

> Not covered by G1/G2/G11 and deliberately absent from T4: renaming and
> transferring ownership. Removing members and leaving are G8–G10 below.

**G3 — Invite link and token.**
Every group carries a `joinToken` of at least 20 random characters, generated at
creation (G1). The owner — and only the owner — sees an Invite panel on the
group detail screen containing the invite URL
`https://<app-host>/join/<groupId>/<token>`, a copy control, and the token shown
as a readable short code for anyone typing it by hand. Non-owners never see the
token: it is the capability that lets a stranger request to join.

**G4 — QR and scanning.**
The Invite panel renders the same URL as a QR code, generated client-side. On
the joining side, the Join entry offers camera scanning **only where a camera is
actually available** (feature-detected `getUserMedia`); elsewhere, and as a
fallback everywhere, a paste-a-link-or-code input is offered. Scanning is pure
navigation — a successful scan goes to the encoded `/join/...` URL and from
there follows exactly the same path as a tapped link. There is no second
code path for scanned invites.

**G5 — Request to join.**
`/join/:groupId/:token` shows the group's name and a Request to join action,
which creates a `joinRequests` document `{groupId, token, uid, username,
status: 'pending', createdAt}`. A signed-out visitor is sent to auth and
returned to the same URL afterwards (A9). Four outcomes are distinguished with
their own message. **Tokens never expire (G3), so no message may say or imply
that one has.** The distinguished outcomes are: valid invite; link truncated or
malformed; group no longer exists; already a member; request already pending;
token refused by the rules; and a permission problem reading the invite.

The screen reads only what a non-member is permitted to read: it probes
`groups/{groupId}` (succeeding *is* the membership test) and otherwise takes the
display name from `groups/{groupId}/public/info`. The token itself is verified
only by the create rule — see plan.md § the `public/info` window.

**G6 — Owner sees pending requests.**
The group detail screen shows the owner a live list of pending requests for that
group — requester's username and when they asked. Non-owners never see it.

**G7 — Accept and decline.**
Accept performs a **single batched write** that adds the uid to `memberIds`, adds
their entry to `members`, and sets the request's status to `accepted` — atomic,
so membership and request status can never disagree. Decline sets status to
`declined` and changes nothing about membership. Both are owner-only, enforced
by rules and not merely by the absence of a button.

> **Deviation from plan.md's data model, recorded deliberately.** plan.md lists
> `joinRequests` as `{groupId, uid, username, status, createdAt}`. The
> implementation adds a **`token`** field, because S2's create rule has to
> compare the presented token against the group's — and rules can only see
> fields that are actually written. The token is not a secret from either party
> who can read the document: the requester presented it, and the owner issued it.

**G12 — Rename a group.** *(added after Phase 1 shipped; owner-briefed)*

The group's owner can change its name from the group screen. Nobody else can,
and the control does not render for anyone else — but the rules are what
enforce it.

- **Validation.** Same bounds as G1: non-empty after trimming, at most 50
  characters. The stored value is the trimmed one.
- **Rules.** The owner-update path permits `name` to change explicitly, and
  continues to pin everything that makes the group what it is: `ownerId`,
  `joinToken`, `memberIds` and the `members` map are all immutable on this
  path. A rename cannot smuggle in a membership change, and a membership change
  cannot smuggle in a rename (that half was already true — see S2).
- **Notification.** A rename writes a `group_renamed` notification to **every
  member except the renamer**, in the **same batch** as the rename itself, so
  the name and the announcement of it can never disagree. Payload:
  `{groupId, oldName, newName, username}` — `username` being the renamer's.
  The renamer is excluded because they just did it; telling them is noise.
- **Live displays follow the listener.** Every screen that shows a group's name
  reads it from a live `onSnapshot`, so a rename appears on the home list and
  the group screen without a reload. **Notification payloads are deliberately
  point-in-time**: a delivered notification keeps the names it was written
  with, because "Alex renamed Family Car to Family Cars" is a statement about
  a moment and rewriting it later would make it a lie.

> **Why `oldName` can be trusted and `newName` cannot.** Rules `get()` sees
> **pre-batch** state, so the group document still holds the OLD name while the
> notification's create rule runs — which means `oldName` can be validated
> against it exactly. `newName` is the value being written in the sibling
> operation and is invisible from here, so it is only length-checked. That is
> not a new capability for the renamer: they are the owner, and an owner who
> wants arbitrary text in front of their members can simply rename the group to
> it. The check that matters is that only the owner can write this type at all.

## N — Notifications

> Authored from the owner's T7 brief. The N1–N5 split is mine — the brief's
> bracket references were approximate. **Review it.**

**N1 — What produces a notification.**
`notifications/{uid}/items/{itemId}` = `{type, payload, read: false, createdAt}`.
Phase 1 has four types, each written **in the same batch as the action that
causes it**, so a notification can never exist for something that didn't happen,
nor an action go unannounced:

| type | goes to | written by |
|---|---|---|
| `join_request` | the group's owner | the requester's join request (G5) |
| `request_accepted` | the requester | the owner's accept batch (G7) |
| `request_declined` | the requester | the owner's decline (G7) |
| `removed_from_group` | the removed member | the owner's removal batch (G10) |

`payload` carries `{groupId, groupName}`, plus `username` for `join_request`.
**Leaving voluntarily notifies nobody** — you know you left.

> Per-car access-change notifications arrive with cars in Phase 2 (G8). Not
> built here.

**N2 — Bell and unread badge.**
The top bar's bell shows a live count of unread items, updating without a
reload. The count is exact to 99 and displays `99+` beyond that. The underlying
query is bounded — it never reads the user's whole history to render a badge.

**N3 — Reading and navigating.**
Each item reads as a sentence ("Alex wants to join Family Cars"). Tapping one
marks it read and goes to the group it concerns. A **Mark all read** action
clears the badge in one step. Read state is per item and only its owner can
change it (N5).

**N4 — The list screen.**
Newest first, **bounded** — a fixed page with an explicit Load more, never an
unbounded listener over all history. Unread items are visually distinct. An
empty list says so rather than rendering nothing.

**N5 — Own-subtree isolation, and the narrow cross-writes.**
- **Read, update, delete:** only `notifications/{uid}/...` where `uid` is the
  caller. Updates may flip **`read` and nothing else** — an item's text cannot
  be rewritten after delivery.
- **Create into someone else's subtree** is permitted only in the shapes above,
  each fully validated: the document's keys are whitelisted, `read` must start
  `false`, `payload.groupName` must match the group's real name, and:
  - `join_request` — the target must be that group's **owner**, and the sender
    must not already be a member.
  - `request_accepted` / `request_declined` — the sender must be the group's
    **owner**, and the target must not yet be a member.
  - `removed_from_group` — the sender must be the group's **owner**, and the
    target must currently be a member.
- Consequence: notifications cannot become a general messaging channel. Every
  create is anchored to a real group and a real role in it.

> **Residual, accepted:** someone who already knows a group's auto-ID could send
> its owner a single well-formed `join_request` notice without holding a valid
> token, since rules evaluate each document in a batch independently. The text
> is not free-form — `groupName` must match the real group and `username` is
> length-capped — so it is noise, not a phishing surface. Closing it entirely
> would mean putting the token in the notification payload.

## S — Security rules

**S3 — Own-profile isolation.**
`users/{uid}` is readable and writable only by that uid, whether the document is
created at first sign-in or later at the username screen (A6). Every other path
is denied by default until a later task opens it deliberately.

**S1 — Group access.**
- **Read:** only if the requesting uid appears in the group's `memberIds`. This
  is what makes H2's `array-contains` query permissible; an unscoped listing of
  `groups` is rejected outright.
- **Create:** only a group that seeds *the creator alone*. `ownerId` must be the
  caller's uid, and `memberIds`, `members` and `canAddCars` must each contain
  exactly that uid — so nobody can conjure a group with other people already
  inside it. `name` must be a 1–50 character string and `joinToken` at least 20
  characters.
- **Update:** owner only, and `ownerId` itself is immutable. The membership
  writes behind the join-accept flow are **not** yet permitted — T5 widens this
  deliberately, alongside S2.
- **Delete:** owner only (G11).

**S2 — Join requests, and the privileged accept.**
The security property Phase 1 turns on: **a requester can never write themselves
into a group.** No Cloud Functions; constrained rules only.

- **Create a request:** any signed-in user, for **themselves only**
  (`request.resource.data.uid == request.auth.uid`), with `status` exactly
  `'pending'`, presenting a `groupId` + `token` pair that a `get()` on the group
  confirms — a wrong token is refused. Someone already in `memberIds` cannot
  create one.
- **Read a request:** the requester reads their own; the group's owner reads
  requests for their group. Nobody else, and there is no way to list requests
  across groups.
- **Update a request:** owner only, and only `pending → accepted | declined`.
  A decided request cannot be re-decided, and `uid`/`groupId` are immutable.
- **Group membership writes:** owner only, and shape-validated. An update that
  changes `memberIds` must **add exactly one uid, remove none**, keep `members`
  in step with `memberIds`, and leave `ownerId`, `joinToken` and `name`
  untouched. The owner's Accept is a batched write over both documents.
- Consequence: the only path into `memberIds` runs through an owner-authenticated
  write. A requester's own credentials can produce nothing but a `pending`
  request about themselves.

> An owner can add any uid they like to their own group without a matching
> request — they could accept any request anyway, so this grants nothing extra.
> Rules validate the *shape* of a membership change, not that a request exists
> for it; cross-document validation would need the request id on the group doc
> and buys no security here.

## G / N / D — Groups, notifications, design

Not yet written. `tasks.md` cites G1–G11, N1–N5 and D1–D4; those requirements
need authoring before T3 onwards can claim to satisfy them.
