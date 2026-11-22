/**
 * Deciding between a popup and a full-page redirect for Google sign-in. [A5]
 *
 * ── Why this isn't just "mobile ? redirect : popup" ────────────────────────
 *
 * A popup on a phone opens a whole new browser tab, which is jarring and on
 * iOS often lands behind the app. Redirect is plainly the better mobile
 * experience — but it only WORKS when the browser lets Firebase read the
 * sign-in state it stashed before leaving.
 *
 * Firebase's redirect flow bounces through `https://<authDomain>/__/auth/…`.
 * When authDomain is a DIFFERENT host from the app, that page's storage is
 * third-party storage, and every browser our users are actually on — Safari
 * (ITP), Firefox (TCP), Chrome — blocks or partitions it. The user comes back
 * from Google, `getRedirectResult()` resolves to null, and they land on the
 * login screen as if nothing happened. Silently. On the exact device this
 * change was meant to improve.
 *
 * Journey Care is in precisely that split configuration today:
 *
 *     app        https://car-log-project.web.app
 *     authDomain      car-log-project.firebaseapp.com
 *
 * Different registrable domains, so redirect is NOT safe to use here yet.
 *
 * ── The fix, and why the check is written this way ─────────────────────────
 *
 * Firebase Hosting serves the auth handler at `/__/auth/*` on every site it
 * hosts — including car-log-project.web.app. Point authDomain at the app's own
 * host and the handler becomes same-origin, third-party storage stops being
 * involved at all, and redirect works everywhere. See docs/auth-redirect.md
 * for the two console steps that requires.
 *
 * So rather than hard-coding either answer, this compares the two hosts at
 * runtime. Today it returns false and everyone keeps the popup that works;
 * the moment authDomain is switched to the app's own host it returns true and
 * phones get the redirect — no code change, and no window where an iPhone user
 * is stranded in a flow that can't complete.
 */

import { firebaseConfig } from "../configurations/firebase-config";

/**
 * True when this looks like a phone or tablet.
 *
 * Viewport width is the primary signal because it's what actually determines
 * whether a popup is a bad experience. The coarse-pointer query catches large
 * phones and small tablets in landscape that would otherwise read as desktop.
 */
export const isMobileClient = (): boolean => {
    if (typeof window === "undefined") return false;

    const narrow = window.matchMedia("(max-width: 767px)").matches;
    const touchFirst = window.matchMedia(
        "(pointer: coarse) and (max-width: 1024px)",
    ).matches;

    return narrow || touchFirst;
};

/**
 * True when Firebase's auth handler is same-origin with the app, which is the
 * condition under which `signInWithRedirect` survives third-party-storage
 * blocking.
 *
 * Deliberately an exact host match, not a suffix or registrable-domain test:
 * `car-log-project.web.app` and `car-log-project.firebaseapp.com` share a
 * project name and nothing else that a browser cares about.
 */
export const isAuthHandlerSameOrigin = (): boolean => {
    if (typeof window === "undefined") return false;

    const authDomain = firebaseConfig.authDomain?.trim();
    if (!authDomain) return false;

    // authDomain is configured bare ("example.web.app"), so compare hosts.
    return authDomain.toLowerCase() === window.location.host.toLowerCase();
};

/**
 * How Google sign-in should start on this device, right now.
 *
 * `redirect` only when it's both the better experience AND able to complete.
 * Everything else gets the popup, which works regardless of where the auth
 * handler lives.
 */
export const preferredGoogleSignInMode = (): "popup" | "redirect" =>
    isMobileClient() && isAuthHandlerSameOrigin() ? "redirect" : "popup";
