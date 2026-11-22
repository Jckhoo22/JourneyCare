import { describe, expect, it } from "vitest";

import { formatRinggit, toMoney } from "./money";

describe("formatRinggit [S3]", () => {
    it("always shows two places", () => {
        expect(formatRinggit(250)).toBe("RM 250.00");
        expect(formatRinggit(250.5)).toBe("RM 250.50");
    });

    it("groups thousands", () => {
        expect(formatRinggit(12345.67)).toBe("RM 12,345.67");
    });

    it("renders a free service honestly", () => {
        // Zero is legitimate — warranty work, or a favour.
        expect(formatRinggit(0)).toBe("RM 0.00");
    });

    /**
     * `spendByYear` is decremented on delete, and the rules deliberately do NOT
     * validate the values inside that map (they can't — see isSpendUpdate).
     * Drift into the negative is therefore possible, and the display's job is
     * to show it rather than hide it behind an absolute value: a negative total
     * is the visible symptom that sends someone to Recalculate.
     */
    it("shows a negative total rather than hiding drift", () => {
        expect(formatRinggit(-12.5)).toBe("RM -12.50");
    });

    /**
     * Display-size headlines opt out of the sen. A column of amounts still
     * wants two places — see the comment on FormatRinggitOptions.
     */
    it("drops decimals when noDecimals is set", () => {
        expect(formatRinggit(1011, { noDecimals: true })).toBe("RM 1,011");
        expect(formatRinggit(1010.6, { noDecimals: true })).toBe("RM 1,011");
        expect(formatRinggit(0, { noDecimals: true })).toBe("RM 0");
    });
});

describe("toMoney", () => {
    it("rounds to sen", () => {
        expect(toMoney(0.1 + 0.2)).toBe(0.3);
        expect(toMoney(250.555)).toBe(250.56);
    });

    /**
     * The one that actually bites: a running total nudged by many increments
     * formats as RM 1,240.50 but fails an exact comparison with the
     * recalculated figure, so Recalculate would report a correction forever.
     */
    it("makes an accumulated total comparable again", () => {
        const drifted = 0.1 + 0.2 + 0.3;

        expect(drifted).not.toBe(0.6);
        expect(toMoney(drifted)).toBe(0.6);
    });
});
