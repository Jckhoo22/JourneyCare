# Journey Care — family onboarding runbook

**App:** https://car-log-project.web.app

This is the script for getting a family member into a group. Roughly two minutes
per person. You do steps 1 and 6; they do 2 to 5.

---

## Before you start (you, once per group)

1. Sign in at https://car-log-project.web.app
2. **Create group** — give it a name everyone will recognise ("Family Cars").
3. Open the group, then tap **Invitation**. That screen shows:
   - a large **QR code**, sized for someone to scan off your phone,
   - the **invite link**, with a copy button,
   - a **typed code**, if someone can't use either.

Keep that screen open for in-person onboarding, or copy the link to send by
message.

---

## What to send them

> Join our car group on Journey Care:
> **https://car-log-project.web.app/join/…**
>
> Open the link, sign in with Google (or make an account), pick a display name,
> and tap **Request to join**. I'll approve it.

---

## Their steps

### 2. Open the invite
- **In person:** point their phone's **normal camera app** at your QR code and
  tap the banner. No app or permission needed.
- **Remotely:** they tap the link you sent.

Either way they land on the same screen.

### 3. Sign in
They'll be asked to sign in first.

- **Continue with Google** — fastest. One tap, no password, no email to check.
- **Email + password** — they'll get a verification email and must click the
  link in it before continuing. See troubleshooting.

### 4. Pick a display name
Everyone chooses a name once, on first entry. It's what the rest of the family
sees. 3–20 characters, any script. Google users get their Google name filled in
already — they can keep it or change it, then tap **Continue**.

### 5. Request to join
They're returned to the invite automatically, showing the group's name. They tap
**Request to join** and see "Request sent".

### 6. You accept
- Your **bell** increments immediately — no refresh.
- Open it, or go to the group → **Members**. Under **Requests to join** you'll
  see their name.
- Tap **Accept**.

Their home screen gains the group straight away, and they get a notification
saying they're in. Done.

---

## Troubleshooting

**"The verification email hasn't arrived."**
Check spam/junk — it comes from `noreply@car-log-project.firebaseapp.com`, which
relatives' providers often filter. On the waiting screen there's a **Resend**
button, available again after 60 seconds. Gmail users: also check the *Promotions*
tab. Simplest fix is usually to sign out and use **Continue with Google** instead.

**"It says my request was already sent."**
That's fine — it means their request is already in the queue and I just haven't
accepted it yet. They don't need to do anything. Nothing is lost by them
reopening the link.

**"The Google sign-in popup didn't appear / vanished."**
Google sign-in opens a popup — on a phone that's a new tab, so tell people to
expect it. The app falls back to a full-page redirect automatically when the
popup is blocked. If they instead tapped outside it to dismiss it, that reads as
a cancel — just tap **Continue with Google** again. On iPhones, Settings →
Safari → *Block Pop-ups* off makes it smoother. (There's a way to drop the popup
entirely on phones; it needs a console change first — see
`docs/auth-redirect.md`.)

**"This invite code wasn't accepted."**
The link was truncated or mistyped — messaging apps sometimes cut long URLs.
**Invite codes never expire**, so it's never staleness. Send them the link again,
or read them the typed code from the Invitation screen.

**"That group no longer exists."**
The group was deleted. Create a new one and send a fresh invite.

**"Scan QR code isn't showing on my phone."**
That button only appears where the browser exposes a camera on a secure
connection. Their normal camera app works regardless — that's the recommended
route anyway.

**They're on the username screen and stuck.**
Names must be 3–20 characters. Emoji-only names can fail; suggest letters.

**Someone needs removing.**
Open the group → **Members** → the bin icon next to their name → confirm.
They're notified, and the group disappears from their list immediately. Members
can also leave on their own; you can't leave a group you own — delete it instead.

---

## Notes for you

- **Only you can accept people.** Possession of the link lets someone *ask*, never
  join. Nothing enters the group without your tap.
- **The invite link and code never expire.** Anyone holding it can request
  repeatedly, so treat it like a house key: fine in the family chat, not public.
  To cut off an old link entirely, delete the group and make a new one — Phase 1
  has no token rotation.
- **Everyone sees the member list**; only you see the Invitation screen,
  requests, and the delete control. A member who types the invite URL directly
  is told to ask you — the code never renders for them.
- **Signing out** is inside the account button (your initial, top right), not a
  one-tap button next to the bell.
- **Offline** shows a black bar at the top. Changes sync when the connection
  returns.
