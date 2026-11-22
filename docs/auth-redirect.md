# Google sign-in: popup vs redirect

**Status: the app uses a popup on every device today.** The redirect path is
written, tested and switched off by a runtime check. This document is how to
switch it on.

---

## The problem with a popup on a phone

`signInWithPopup` opens a new browser tab. On a phone that's disorienting — on
iOS the new tab often lands behind the app, and people think sign-in failed.
Redirect (`signInWithRedirect`) navigates the current tab to Google and back,
which is what a phone user expects.

## Why we can't just switch to redirect

Firebase's redirect flow bounces through `https://<authDomain>/__/auth/handler`
and needs to read, on the way back, the state it stashed on the way out.

Journey Care's two domains are different hosts:

| | |
|---|---|
| app | `https://car-log-project.web.app` |
| authDomain | `car-log-project.firebaseapp.com` |

So that handler page is **third-party** relative to the app. Safari (ITP),
Firefox (Total Cookie Protection) and Chrome's third-party-cookie restrictions
all block or partition its storage. The failure is silent and total:

1. User taps *Continue with Google* on their iPhone.
2. They authenticate with Google fine.
3. They come back to the app.
4. `getRedirectResult()` resolves to `null`. They're on the login screen again,
   with no error, forever.

That is worse than the popup it was meant to replace, and it would land on
exactly the devices the family will be using.

**This was not verified against the deployed site** — completing a real Google
OAuth round trip on a physical iPhone isn't something the build can do. The
configuration above is read straight from `.env` and `.firebaserc`, and the
third-party-storage behaviour is the documented, well-known consequence of it.
Rather than ship a coin-flip, the code detects the condition and takes the path
that works.

## What the code does instead

`src/utils/authMode.ts` compares the configured `authDomain` against
`window.location.host` at runtime:

```
redirect  ⟸  it's a phone-sized client  AND  the auth handler is same-origin
popup     ⟸  anything else
```

Today the second condition is false, so every device gets the popup. Nothing is
stranded, and nothing needs changing if you decide to leave it this way.

## Turning redirect on

Firebase Hosting already serves the auth handler at `/__/auth/*` on **every**
site it hosts — including `car-log-project.web.app`. Pointing `authDomain` at
the app's own host makes the handler same-origin, and the whole third-party
storage problem disappears.

Three steps, two of them in consoles:

1. **Google Cloud console** → *APIs & Services* → *Credentials* → the OAuth 2.0
   Web client Firebase created. Under **Authorised redirect URIs**, add:

   ```
   https://car-log-project.web.app/__/auth/handler
   ```

   Leave the existing `…firebaseapp.com` URI in place — removing it would break
   any session mid-flight.

2. **Firebase console** → *Authentication* → *Settings* → *Authorised domains*.
   Confirm `car-log-project.web.app` is listed. (Firebase adds both hosting
   domains automatically, so it almost certainly already is.)

3. **This repo** — change one line in `.env`:

   ```
   VITE_FIREBASE_AUTH_DOMAIN="car-log-project.web.app"
   ```

   then `npm run build && firebase deploy --only hosting`.

`.env.example` documents this choice alongside the key.

## Verifying it, on a real phone

The check that matters is step 4 below — the one that fails silently today.

1. On an iPhone, open `https://car-log-project.web.app` in Safari.
2. Sign out if you're signed in.
3. Tap **Continue with Google**. The page itself should navigate — no new tab.
4. Complete Google's flow. **You must land back in the app already signed in.**
   If you land on the login screen instead, redirect is still broken: revert
   `.env` to `car-log-project.firebaseapp.com`, redeploy, and everyone is back
   on the popup.
5. Repeat in Safari Private Browsing, which applies the strictest storage
   rules.

Also worth a pass on desktop Chrome to confirm it still takes the popup — the
viewport check should keep it there.
