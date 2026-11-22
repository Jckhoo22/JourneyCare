import { describe, expect, it } from "vitest";
import { parseInvite } from "./inviteLink";

const GROUP = "abc123";
const TOKEN = "0123456789abcdef0123456789abcdef";

describe("parseInvite", () => {
    it("reads a full invite URL", () => {
        expect(parseInvite(`https://car-log-project.web.app/join/${GROUP}/${TOKEN}`))
            .toEqual({ groupId: GROUP, token: TOKEN });
    });

    it("reads a localhost URL with a port", () => {
        expect(parseInvite(`http://localhost:3000/join/${GROUP}/${TOKEN}`)).toEqual({
            groupId: GROUP,
            token: TOKEN,
        });
    });

    it("reads a bare path", () => {
        expect(parseInvite(`/join/${GROUP}/${TOKEN}`)).toEqual({
            groupId: GROUP,
            token: TOKEN,
        });
    });

    it("still reads the legacy `<groupId>/<token>` shape a paste might carry", () => {
        // The typeable code UI is gone, but someone pasting a value copied
        // from that older UI still expects the joiner to accept it.
        expect(parseInvite(`${GROUP}/${TOKEN}`)).toEqual({
            groupId: GROUP,
            token: TOKEN,
        });
    });

    it("tolerates the whitespace messaging apps add", () => {
        expect(parseInvite(`  \n  /join/${GROUP}/${TOKEN}  \n`)).toEqual({
            groupId: GROUP,
            token: TOKEN,
        });
    });

    it("ignores a query string and hash", () => {
        expect(
            parseInvite(`https://x.web.app/join/${GROUP}/${TOKEN}?utm=whatsapp#x`),
        ).toEqual({ groupId: GROUP, token: TOKEN });
    });

    it("ignores a trailing slash", () => {
        expect(parseInvite(`https://x.web.app/join/${GROUP}/${TOKEN}/`)).toEqual({
            groupId: GROUP,
            token: TOKEN,
        });
    });

    it("rejects a token that is too short to be real", () => {
        // Mirrors the 20-character floor the rules enforce.
        expect(parseInvite(`/join/${GROUP}/short`)).toBeNull();
    });

    it("rejects junk", () => {
        expect(parseInvite("")).toBeNull();
        expect(parseInvite("   ")).toBeNull();
        expect(parseInvite("hello there")).toBeNull();
        expect(parseInvite("https://example.com")).toBeNull();
        expect(parseInvite(GROUP)).toBeNull();
    });

    it("rejects segments with illegal characters", () => {
        expect(parseInvite(`/join/${GROUP}/${TOKEN.slice(0, 30)}$$`)).toBeNull();
    });
});
