import { describe, expect, it } from "vitest";
import { parseOdometer } from "./aiOdometerParser";

describe("parseOdometer", () => {
    it("parses a high-confidence reading", () => {
        expect(parseOdometer('{"odometer": 128400, "confidence": "high"}'))
            .toEqual({ odometer: 128400, confidence: "high" });
    });

    it("parses a low-confidence reading", () => {
        expect(parseOdometer('{"odometer": 128400, "confidence": "low"}'))
            .toEqual({ odometer: 128400, confidence: "low" });
    });

    it("rounds a fractional reading", () => {
        expect(parseOdometer('{"odometer": 128400.7, "confidence": "high"}'))
            .toEqual({ odometer: 128401, confidence: "high" });
    });

    it("accepts zero — the prompt's couldn't-read-it signal", () => {
        expect(parseOdometer('{"odometer": 0, "confidence": "low"}'))
            .toEqual({ odometer: 0, confidence: "low" });
    });

    it("strips markdown fences", () => {
        expect(parseOdometer('```json\n{"odometer": 128400, "confidence": "high"}\n```'))
            .toEqual({ odometer: 128400, confidence: "high" });
    });

    it("returns null on invalid JSON", () => {
        expect(parseOdometer("not json")).toBeNull();
    });

    it("returns null on negative reading", () => {
        expect(parseOdometer('{"odometer": -1, "confidence": "high"}')).toBeNull();
    });

    it("returns null on absurd reading", () => {
        expect(parseOdometer('{"odometer": 999999999, "confidence": "high"}')).toBeNull();
    });

    it("returns null when odometer is missing", () => {
        expect(parseOdometer('{"confidence": "high"}')).toBeNull();
    });

    it("defaults confidence to 'low' when the value is unrecognised", () => {
        expect(parseOdometer('{"odometer": 128400, "confidence": "medium"}'))
            .toEqual({ odometer: 128400, confidence: "low" });
    });
});
