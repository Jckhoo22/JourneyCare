import { describe, expect, it } from "vitest";
import { parseReceipt, stripFences } from "./aiReceiptParser";

/**
 * Unit tests for the receipt parser. [T22, AI3]
 *
 * ── The property under test ──────────────────────────────────────────
 * Every failure branch AI3 names — malformed JSON, unknown types,
 * missing fields, low-confidence flags — becomes a normal, usable UX
 * state rather than an error the user has to interpret. The parser is
 * PURE so this is provable without touching Firebase or the real model.
 */

describe("stripFences", () => {
    it("removes ```json fences the model tends to add", () => {
        expect(stripFences('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
    });

    it("removes bare ``` fences", () => {
        expect(stripFences('```\n{"a": 1}\n```')).toBe('{"a": 1}');
    });

    it("passes clean JSON through unchanged", () => {
        expect(stripFences('{"a": 1}')).toBe('{"a": 1}');
    });
});

describe("parseReceipt — the happy path", () => {
    it("parses a well-formed multi-item receipt", () => {
        const raw = JSON.stringify({
            date: "2026-07-15",
            odometer: 128400,
            workshop: "Ah Seng Auto",
            items: [
                {
                    type: "engine_oil",
                    rawText: "Minyak enjin 5W-30",
                    cost: 250,
                    confidence: "high",
                },
                {
                    type: "oil_filter",
                    rawText: "Penapis minyak",
                    cost: 45,
                    confidence: "high",
                },
            ],
        });

        const result = parseReceipt(raw);
        expect(result).not.toBeNull();
        expect(result!.draft.date).toBe("2026-07-15");
        expect(result!.draft.odometer).toBe("128400");
        expect(result!.draft.workshop).toBe("Ah Seng Auto");
        expect(result!.draft.items).toHaveLength(2);
        expect(result!.draft.items[0].type).toBe("engine_oil");
        expect(result!.draft.items[0].cost).toBe("250");
        expect(result!.lowConfidenceCount).toBe(0);
        expect(result!.otherCount).toBe(0);
    });

    it("prefills interval defaults from the preset", () => {
        const raw = JSON.stringify({
            date: "2026-07-15",
            items: [
                {
                    type: "engine_oil",
                    rawText: "Engine oil",
                    cost: 250,
                    confidence: "high",
                },
            ],
        });
        const result = parseReceipt(raw)!;
        // engine_oil has km & months intervals in maintenance-types.json.
        expect(result.draft.items[0].intervalKm).not.toBe("");
        expect(result.draft.items[0].intervalMonths).not.toBe("");
    });

    it("counts low-confidence items", () => {
        const raw = JSON.stringify({
            date: "2026-07-15",
            items: [
                { type: "engine_oil", rawText: "Oil", cost: 250, confidence: "high" },
                { type: "engine_oil", rawText: "?", cost: 100, confidence: "low" },
                { type: "engine_oil", rawText: "?", cost: 100, confidence: "low" },
            ],
        });
        expect(parseReceipt(raw)!.lowConfidenceCount).toBe(2);
    });
});

describe("parseReceipt — fallback branches [AI3]", () => {
    it("returns null on invalid JSON", () => {
        expect(parseReceipt("{{not json")).toBeNull();
    });

    it("returns null when items isn't an array", () => {
        expect(
            parseReceipt(JSON.stringify({ date: "2026-07-15" })),
        ).toBeNull();
    });

    it("coerces an unknown type to custom with the raw text as label", () => {
        const raw = JSON.stringify({
            date: "2026-07-15",
            items: [
                {
                    type: "flux_capacitor_service",
                    rawText: "Flux capacitor replacement",
                    cost: 999,
                    confidence: "high",
                },
            ],
        });
        const result = parseReceipt(raw)!;
        expect(result.draft.items[0].type).toBe("custom");
        expect(result.draft.items[0].customLabel).toBe(
            "Flux capacitor replacement",
        );
        expect(result.otherCount).toBe(1);
    });

    it("treats 'other' from the model as custom too", () => {
        const raw = JSON.stringify({
            date: "2026-07-15",
            items: [
                { type: "other", rawText: "Special part", cost: 50, confidence: "high" },
            ],
        });
        const result = parseReceipt(raw)!;
        expect(result.draft.items[0].type).toBe("custom");
        expect(result.draft.items[0].customLabel).toBe("Special part");
    });

    it("strips markdown fences before parsing", () => {
        const raw = '```json\n{"date":"2026-07-15","items":[{"type":"engine_oil","rawText":"Oil","cost":250,"confidence":"high"}]}\n```';
        expect(parseReceipt(raw)).not.toBeNull();
    });

    it("provides a blank row when items is empty", () => {
        const raw = JSON.stringify({ date: "2026-07-15", items: [] });
        const result = parseReceipt(raw)!;
        expect(result.draft.items).toHaveLength(1);
        expect(result.draft.items[0].type).toBe("");
    });

    it("filters malformed items but keeps well-formed ones", () => {
        const raw = JSON.stringify({
            date: "2026-07-15",
            items: [
                null,
                42,
                { type: "engine_oil", rawText: "Oil", cost: 250, confidence: "high" },
            ],
        });
        const result = parseReceipt(raw)!;
        expect(result.draft.items).toHaveLength(1);
        expect(result.draft.items[0].type).toBe("engine_oil");
    });

    it("defaults date to today when the field is missing or bad", () => {
        const raw = JSON.stringify({
            date: "not a date",
            items: [
                { type: "engine_oil", rawText: "Oil", cost: 250, confidence: "high" },
            ],
        });
        const result = parseReceipt(raw)!;
        expect(result.draft.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("treats negative or zero cost as empty (user retypes)", () => {
        const raw = JSON.stringify({
            date: "2026-07-15",
            items: [
                { type: "engine_oil", rawText: "Free oil", cost: 0, confidence: "high" },
                { type: "engine_oil", rawText: "?", cost: -50, confidence: "low" },
            ],
        });
        const result = parseReceipt(raw)!;
        expect(result.draft.items[0].cost).toBe("");
        expect(result.draft.items[1].cost).toBe("");
    });
});
