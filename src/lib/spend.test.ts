import { describe, expect, it } from "vitest";

import {
    currentYear,
    sameSpendByYear,
    spendYearOf,
    sumMoney,
    totalsByType,
    type SpendEntry,
} from "./spend";

const entry = (
    key: string,
    cost: number,
    label = key,
): SpendEntry => ({ key, label, cost });

describe("spendYearOf [S2]", () => {
    it("buckets by the LOCAL year", () => {
        expect(spendYearOf(new Date(2026, 6, 27))).toBe("2026");
        expect(spendYearOf(new Date(2025, 11, 31))).toBe("2025");
    });

    /**
     * D1's year boundary, stated as a test: the key is derived from the date,
     * so 1 January simply asks for a bucket that doesn't exist yet and reads
     * back as zero. Nothing rolls anything over.
     */
    it("gives January its own bucket without any rollover", () => {
        expect(spendYearOf(new Date(2026, 11, 31))).toBe("2026");
        expect(spendYearOf(new Date(2027, 0, 1))).toBe("2027");
    });
});

describe("currentYear", () => {
    it("reads the year at call time", () => {
        expect(currentYear(new Date(2026, 6, 27))).toBe("2026");
    });
});

describe("totalsByType [S1]", () => {
    it("groups by key and counts the entries behind each total", () => {
        const lines = totalsByType([
            entry("engine_oil", 250.5, "Engine oil"),
            entry("engine_oil", 249.5, "Engine oil"),
            entry("tires", 1200, "Tires"),
        ]);

        expect(lines).toEqual([
            { key: "tires", label: "Tires", total: 1200, count: 1 },
            { key: "engine_oil", label: "Engine oil", total: 500, count: 2 },
        ]);
    });

    it("sorts biggest first", () => {
        const lines = totalsByType([
            entry("a", 10),
            entry("b", 900),
            entry("c", 100),
        ]);

        expect(lines.map((line) => line.key)).toEqual(["b", "c", "a"]);
    });

    // Two buckets holding the same amount must not swap places between renders.
    it("breaks ties by label, so the order never flickers", () => {
        const lines = totalsByType([
            entry("z", 100, "Zebra"),
            entry("a", 100, "Aardvark"),
        ]);

        expect(lines.map((line) => line.label)).toEqual(["Aardvark", "Zebra"]);
    });

    it("keeps the bucket totals addable to the figure above them", () => {
        const lines = totalsByType([
            entry("x", 0.1),
            entry("x", 0.2),
            entry("y", 0.3),
        ]);

        expect(lines.map((line) => line.total)).toEqual([0.3, 0.3]);
        expect(sumMoney(lines.map((line) => line.total))).toBe(0.6);
    });

    it("keeps a free service visible instead of dropping it", () => {
        // Warranty work costs nothing but still happened. [L2]
        const lines = totalsByType([entry("warranty", 0, "Warranty")]);

        expect(lines).toEqual([
            { key: "warranty", label: "Warranty", total: 0, count: 1 },
        ]);
    });

    it("has nothing to say about no entries", () => {
        expect(totalsByType([])).toEqual([]);
    });
});

describe("sumMoney", () => {
    it("adds without letting float drift into the answer", () => {
        expect(sumMoney([0.1, 0.2])).toBe(0.3);
        expect(sumMoney([])).toBe(0);
    });
});

/**
 * The property that keeps Recalculate honest: run on a healthy group it must
 * report "nothing needed fixing", which means an absent bucket and a zero one
 * have to compare equal.
 */
describe("sameSpendByYear [T14]", () => {
    it("treats an absent bucket and a zero bucket as the same", () => {
        expect(sameSpendByYear({ "2026": 100 }, { "2026": 100, "2025": 0 })).toBe(
            true,
        );
        expect(sameSpendByYear(undefined, {})).toBe(true);
        expect(sameSpendByYear(undefined, { "2026": 0 })).toBe(true);
    });

    it("sees a real difference", () => {
        expect(sameSpendByYear({ "2026": 100 }, { "2026": 100.5 })).toBe(false);
        expect(sameSpendByYear({}, { "2026": 100 })).toBe(false);
    });

    it("ignores drift below a sen", () => {
        expect(
            sameSpendByYear({ "2026": 1240.4999999999998 }, { "2026": 1240.5 }),
        ).toBe(true);
    });
});
