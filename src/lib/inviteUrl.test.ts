import { describe, expect, it } from "vitest";
import {
    buildInviteUrl,
    displayInviteUrl,
    inviteOrigin,
} from "./inviteUrl";

/**
 * These tests pin the CONFIGURED origin, not `window.location`. The whole
 * point of the polish that introduced this module: a QR generated on a
 * dev server encodes the production origin so a phone scanning it lands
 * on the live site. If tests started reading window.location, this
 * guarantee would silently regress.
 */

const GROUP = "abc123";
const TOKEN = "0123456789abcdef0123456789abcdef";

describe("buildInviteUrl", () => {
    it("anchors invite URLs to the configured origin", () => {
        // Vitest tests run without VITE_APP_ORIGIN set, so the module's
        // fallback (the production host) IS the origin under test.
        expect(buildInviteUrl(GROUP, TOKEN)).toBe(
            `${inviteOrigin()}/join/${GROUP}/${TOKEN}`,
        );
    });

    it("never uses window.location.origin", () => {
        // If someone brings the old helper back, this fails.
        const url = buildInviteUrl(GROUP, TOKEN);
        expect(url.startsWith(inviteOrigin())).toBe(true);
        expect(url).not.toContain("localhost");
        expect(url).not.toContain("127.0.0.1");
    });
});

describe("displayInviteUrl", () => {
    it("strips the scheme and ellipsises the path", () => {
        // Only the host + `/join/` is legible on the invite card. The token
        // itself doesn't need to be readable — Copy/Share carry the real URL.
        const shown = displayInviteUrl(GROUP, TOKEN);
        expect(shown).not.toMatch(/^https?:\/\//);
        expect(shown).toContain("/join/…");
        expect(shown).not.toContain(TOKEN);
    });

    it("keeps the origin's host visible", () => {
        // The user should be able to see this is a Journey Care invite.
        const shown = displayInviteUrl(GROUP, TOKEN);
        const host = inviteOrigin().replace(/^https?:\/\//, "");
        expect(shown.startsWith(host)).toBe(true);
    });
});

describe("inviteOrigin", () => {
    it("returns a real URL origin (has scheme + host, no trailing slash)", () => {
        const origin = inviteOrigin();
        expect(origin).toMatch(/^https?:\/\/[^/]+$/);
    });
});
