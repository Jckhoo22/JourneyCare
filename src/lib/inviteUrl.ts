/**
 * Build invite URLs from a configured origin. [Invite polish]
 *
 * The old helper read `window.location.origin`, which meant a QR generated
 * on a dev server encoded `http://localhost:5173/join/...` — unusable when
 * scanned from a real phone. This one reads the origin from
 * `VITE_APP_ORIGIN` at build time (or falls back to the production host),
 * so any developer scanning their own dev-rendered QR lands on the live
 * site's join flow — the sacred deep-link path stays walkable end to end
 * even from a laptop.
 *
 * The join token and path (`/join/:groupId/:token`) are unchanged — only
 * how the URL is BUILT is different. Rules, join logic, notifications and
 * every existing invite link mint the same URL as before once
 * `VITE_APP_ORIGIN` matches the deployed host.
 */

import { joinPath } from "../constants/routes";

/**
 * The origin invite URLs are anchored on. Live for the whole app's life —
 * one deployment, one origin — so we read it once at module load.
 *
 * Trailing slash stripped so `${origin}${path}` never doubles the "/". A
 * missing env var falls back to production rather than an empty string,
 * because a bare `/join/...` URL scans as "relative to whatever site the
 * scanner opens", which is not what an invite means.
 */
const DEFAULT_ORIGIN = "https://car-log-project.web.app";

const APP_ORIGIN = ((): string => {
    const raw = import.meta.env.VITE_APP_ORIGIN;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return (trimmed || DEFAULT_ORIGIN).replace(/\/$/, "");
})();

/** The full URL a QR code encodes and the owner shares. [G3] */
export const buildInviteUrl = (groupId: string, token: string): string =>
    `${APP_ORIGIN}${joinPath(groupId, token)}`;

/**
 * How the URL renders on the invite screen — host + path, no scheme, path
 * ellipsised so the token doesn't wrap onto three lines. Display only:
 * `buildInviteUrl` is what actually gets shared or copied.
 */
export const displayInviteUrl = (groupId: string, token: string): string => {
    const full = buildInviteUrl(groupId, token);
    const withoutScheme = full.replace(/^https?:\/\//, "");
    // Everything after `/join/` collapses to an ellipsis. The visible bit
    // ("host/join") is enough to tell a shoulder-surfing recipient that this
    // is a Journey Care invite; the token itself doesn't need to be legible.
    return withoutScheme.replace(/\/join\/.*/, "/join/…");
};

/** The configured origin, exposed for tests and diagnostics. */
export const inviteOrigin = (): string => APP_ORIGIN;
