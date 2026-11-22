/**
 * Odometer-snap parser. [T23, ODO2]
 *
 * Pure sibling of `aiReceiptParser` — same defensive JSON handling, same
 * mocked-response testability. Contract:
 *
 *   { odometer: number, confidence: "high" | "low" }
 *
 * The prompt (aiPrompts.ts § ODOMETER_PROMPT) tells the model to
 * return `{ odometer: 0, confidence: "low" }` when it cannot read the
 * value at all — so a zero here is a real signal, not a parse failure.
 */

import { stripFences } from "./aiReceiptParser";

export interface ParsedOdometer {
    odometer: number;
    confidence: "high" | "low";
}

/**
 * Parses the model's odometer response defensively.
 *
 * Returns null on:
 *  - invalid JSON
 *  - non-numeric or negative `odometer`
 *  - absurd readings (> 10 million km, matching the car's isValidOdometer rule)
 *
 * A parsed `{ odometer: 0, confidence: "low" }` IS valid — that's the
 * prompt's "couldn't read it" signal, and the UI should route to the
 * manual form for that case rather than showing an old→new confirm.
 */
export const parseOdometer = (text: string): ParsedOdometer | null => {
    let raw: unknown;
    try {
        raw = JSON.parse(stripFences(text));
    } catch {
        return null;
    }

    if (!raw || typeof raw !== "object") return null;
    const response = raw as { odometer?: unknown; confidence?: unknown };

    if (typeof response.odometer !== "number") return null;
    if (!Number.isFinite(response.odometer)) return null;
    if (response.odometer < 0) return null;
    if (response.odometer > 10_000_000) return null;

    return {
        odometer: Math.round(response.odometer),
        confidence: response.confidence === "high" ? "high" : "low",
    };
};
