/**
 * Parse whatever the joiner pasted into an invite. [G4]
 *
 * ── History ────────────────────────────────────────────────────────────────
 * This module used to also BUILD invite URLs (via `window.location.origin`)
 * and format a chunked typeable code — both retired in the invite-panel
 * polish pass. The build path moved to `src/lib/inviteUrl.ts` (production
 * origin from `VITE_APP_ORIGIN`, not `window.location`); the typeable code
 * went away entirely because the join flow only ever needed the link, and
 * a dozen chunked hex characters aren't a code anyone reasonably types.
 *
 * The parser stays here — it accepts a full URL, a bare `/join/...` path,
 * or the legacy `<groupId>/<token>` shape a paste from an older copy button
 * might carry. Rules and route unchanged; this only reads.
 */

export interface InviteParts {
    groupId: string;
    token: string;
}

const SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Parses whatever the joiner pasted: a full invite URL, a `/join/...` path,
 * or the bare `<groupId>/<token>` shape a paste from an older copy button
 * might carry. Returns null if it isn't an invite.
 *
 * Lenient about surrounding junk (messaging apps love to add whitespace) but
 * strict about the shape of the two segments it extracts.
 */
export const parseInvite = (input: string): InviteParts | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Drop scheme/host/query/hash, keeping only the path-ish part.
    let path = trimmed;
    const schemeSplit = path.split("://");
    if (schemeSplit.length > 1) {
        path = schemeSplit[1].substring(schemeSplit[1].indexOf("/") + 1);
    }
    path = path.split("?")[0].split("#")[0];

    const segments = path.split("/").filter(Boolean);
    if (segments.length < 2) return null;

    // Prefer the pair following a "join" segment; otherwise take the last two.
    const joinIndex = segments.lastIndexOf("join");
    const [groupId, token] =
        joinIndex >= 0 && segments.length >= joinIndex + 3
            ? segments.slice(joinIndex + 1, joinIndex + 3)
            : segments.slice(-2);

    if (!SEGMENT.test(groupId) || !SEGMENT.test(token)) return null;
    // Mirrors the 20-character floor the rules enforce on joinToken.
    if (token.length < 20) return null;

    return { groupId, token };
};
