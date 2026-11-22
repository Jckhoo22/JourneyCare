import { describe, expect, it } from "vitest";

import { matchesLog, type SearchableLog } from "./logSearch";

const log = (over: Partial<SearchableLog> = {}): SearchableLog => ({
    label: "Engine oil",
    cost: 250,
    ...over,
});

describe("matchesLog [L6]", () => {
    it("matches everything when nothing has been typed", () => {
        // The caller passes the raw field through, so the unfiltered state has
        // to be the empty query rather than a special case at the call site.
        expect(matchesLog(log(), "")).toBe(true);
        expect(matchesLog(log(), "   ")).toBe(true);
    });

    it("matches the service type, case-insensitively", () => {
        expect(matchesLog(log(), "engine")).toBe(true);
        expect(matchesLog(log(), "ENGINE")).toBe(true);
        expect(matchesLog(log(), "OIL")).toBe(true);
        expect(matchesLog(log(), "brake")).toBe(false);
    });

    it("matches a custom type by the label the user gave it", () => {
        const custom = log({ label: "Aircond compressor" });

        expect(matchesLog(custom, "compressor")).toBe(true);
        expect(matchesLog(custom, "aircond")).toBe(true);
    });

    it("matches inside the notes", () => {
        const noted = log({ notes: "Replaced under warranty, waited 2 hours" });

        expect(matchesLog(noted, "warranty")).toBe(true);
        expect(matchesLog(noted, "waited")).toBe(true);
    });

    /**
     * There is no workshop field on a log — the document is pinned to
     * {type, customLabel, cost, date, odometer, intervalKm, intervalMonths,
     * notes, createdBy, createdAt} by the rules whitelist. People record a
     * workshop in the notes, so notes search IS workshop search.
     */
    it("finds a workshop name recorded in the notes", () => {
        const noted = log({ notes: "Done at Yong Seng Auto, Cheras" });

        expect(matchesLog(noted, "yong seng")).toBe(true);
        expect(matchesLog(noted, "cheras")).toBe(true);
    });

    it("matches who logged it", () => {
        expect(matchesLog(log({ loggedBy: "Jie Cheng" }), "jie")).toBe(true);
        expect(matchesLog(log({ loggedBy: "Jie Cheng" }), "cheng")).toBe(true);
    });

    describe("cost", () => {
        it("matches the bare number", () => {
            expect(matchesLog(log({ cost: 250 }), "250")).toBe(true);
        });

        it("matches the way the amount is displayed", () => {
            expect(matchesLog(log({ cost: 250 }), "250.00")).toBe(true);
            expect(matchesLog(log({ cost: 1500 }), "1,500.00")).toBe(true);
        });

        it("ignores the grouping comma either way round", () => {
            expect(matchesLog(log({ cost: 1500 }), "1500")).toBe(true);
            expect(matchesLog(log({ cost: 1500 }), "1,500")).toBe(true);
        });

        it("accepts the currency prefix people actually type", () => {
            expect(matchesLog(log({ cost: 250 }), "rm250")).toBe(true);
            expect(matchesLog(log({ cost: 250 }), "RM 250")).toBe(true);
        });

        it("matches a free service, which is a real entry", () => {
            // Warranty work costs nothing and still happened. [L2]
            expect(matchesLog(log({ cost: 0 }), "0")).toBe(true);
        });
    });

    describe("multiple terms", () => {
        /**
         * AND across the whole record, not a phrase match. "oil 90" finds an
         * engine oil change that cost RM 90 even though the two terms live in
         * different fields and never appear next to each other — which is how
         * someone searches a list they can already see.
         */
        it("requires every term, but not in one field", () => {
            const entry = log({ label: "Engine oil", cost: 90 });

            expect(matchesLog(entry, "oil 90")).toBe(true);
            expect(matchesLog(entry, "90 oil")).toBe(true);
            expect(matchesLog(entry, "oil 91")).toBe(false);
        });

        it("collapses runs of whitespace", () => {
            expect(matchesLog(log(), "  engine    oil  ")).toBe(true);
        });
    });

    it("does not match a term that appears nowhere", () => {
        expect(
            matchesLog(log({ notes: "topped up", loggedBy: "Ali" }), "gearbox"),
        ).toBe(false);
    });
});
