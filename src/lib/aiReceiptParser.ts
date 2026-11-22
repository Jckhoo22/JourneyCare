import { findPreset, maintenancePresets } from "../model/CarCatalogue";
import type { VisitDraft, VisitItemDraft } from "../model/Visit";
import { emptyVisitItem } from "../model/Visit";
import { todayInputValue } from "../model/Log";

/**
 * Defensive parser for the receipt-scan JSON contract. [AI3, T22]
 *
 * PURE, no Firebase, no React — mirrors `lib/nextDue.ts` and
 * `lib/spend.ts`. That is what makes every fallback branch (blurry,
 * quota, malformed) a first-class unit test with a MOCKED model response
 * rather than a live-emulator ceremony.
 *
 * ── Contract ──────────────────────────────────────────────────────────
 * The model is asked to return:
 *
 *   { date, odometer?, workshop?, items: [ { type, rawText, cost,
 *     confidence: "high"|"low" } ] }
 *
 * with `type` a preset id from maintenance-types.json or the literal
 * `"other"`. See `src/lib/aiPrompts.ts § RECEIPT_PROMPT`.
 *
 * ── Failure modes handled here ────────────────────────────────────────
 * - Markdown fences ```json … ``` — stripped before JSON.parse.
 * - JSON.parse throws — returns null.
 * - Unknown `type` id — coerced to CUSTOM_TYPE ("custom") with the
 *   raw text becoming the `customLabel`. Never to `"other"` unless
 *   the model said so; a coerced "other" would be dishonest.
 * - Missing fields — filled from defaults; date defaults to today, cost
 *   to zero.
 * - Non-array `items` — returns null (this receipt has no line items,
 *   so a manual form is the honest UX). Empty array is fine and returns
 *   a single blank row so the user sees the form ready to fill.
 *
 * ── What is NOT computed here ─────────────────────────────────────────
 * Next-due. Decision #20 pins that to `lib/nextDue.ts` — one source of
 * truth. This function produces a VisitDraft; next-due preview happens
 * at the UI level from the resolved intervals.
 */

/** The raw response shape the model is expected to return. */
export interface RawReceiptResponse {
    date?: string | null;
    odometer?: number | null;
    workshop?: string | null;
    items?: RawReceiptItem[];
}

export interface RawReceiptItem {
    type?: string;
    rawText?: string;
    cost?: number;
    confidence?: "high" | "low";
}

/** What the parser returns to the caller. */
export interface ParsedReceipt {
    draft: VisitDraft;
    /** How many items came back at low confidence. Drives the review flag. */
    lowConfidenceCount: number;
    /** How many items had an unrecognised type. Also drives review. */
    otherCount: number;
}

/**
 * Strips markdown code fences the model tends to wrap JSON in even when
 * told not to. Both ```json and bare ``` fences.
 */
export const stripFences = (text: string): string => {
    let out = text.trim();
    if (out.startsWith("```")) {
        // Drop the first fence line (may or may not include a language tag).
        const firstNewline = out.indexOf("\n");
        if (firstNewline !== -1) out = out.slice(firstNewline + 1);
    }
    if (out.endsWith("```")) {
        out = out.slice(0, out.lastIndexOf("```"));
    }
    return out.trim();
};

/** True when `id` is a known preset OR the literal "other". */
const isKnownType = (id: string): boolean =>
    id === "other" ||
    maintenancePresets().some((preset) => preset.id === id);

/** "engine_oil" if preset, else the CUSTOM_TYPE sentinel. */
const coerceType = (raw: string | undefined): string => {
    if (!raw) return "custom";
    if (raw === "custom") return "custom";
    if (raw === "other") return "custom";
    if (isKnownType(raw)) return raw;
    return "custom";
};

const parseNumber = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return value;
    }
    return 0;
};

const parseIsoDate = (value: unknown): string => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }
    return todayInputValue();
};

/**
 * Turns a validated raw response into a VisitDraft.
 *
 * Returns `null` when the response is fundamentally unusable: not an
 * object, or `items` isn't an array. Both cases should route the user
 * to the manual form with the "Couldn't read it" copy.
 */
export const parseReceipt = (
    text: string,
): ParsedReceipt | null => {
    const stripped = stripFences(text);
    let raw: unknown;
    try {
        raw = JSON.parse(stripped);
    } catch {
        return null;
    }

    if (!raw || typeof raw !== "object") return null;
    const response = raw as RawReceiptResponse;

    if (!Array.isArray(response.items)) return null;

    const items: VisitItemDraft[] = [];
    let lowConfidenceCount = 0;
    let otherCount = 0;

    for (const rawItem of response.items) {
        if (!rawItem || typeof rawItem !== "object") continue;

        const rawType = typeof rawItem.type === "string" ? rawItem.type : undefined;
        const type = coerceType(rawType);
        // Track whether this came from "other" or an unknown id — we
        // want the UI to prompt the user to check custom rows first.
        const rawText = typeof rawItem.rawText === "string" ? rawItem.rawText : "";
        const cost = parseNumber(rawItem.cost);
        const confidence: "high" | "low" =
            rawItem.confidence === "low" ? "low" : "high";

        if (confidence === "low") lowConfidenceCount += 1;
        if (type === "custom" && rawType !== "custom") otherCount += 1;

        // For a coerced-to-custom row, the raw text IS the label so the
        // user can see what the model read even if the type mapping missed.
        const customLabel = type === "custom" ? rawText : "";

        // Prefill intervals from the preset when we have one — matches
        // the manual entry flow's behaviour after picking a type.
        const preset = type === "custom" ? undefined : findPreset(type);

        items.push({
            ...emptyVisitItem(),
            type,
            customLabel,
            cost: cost > 0 ? String(cost) : "",
            notes: rawText,
            intervalKm: preset?.km ? String(preset.km) : "",
            intervalMonths: preset?.months ? String(preset.months) : "",
            confidence,
            rawText,
        });
    }

    // Even a receipt with zero items reads legitimate — the user pointed
    // at their lunch bill by accident. Give them an empty row so the
    // form is ready to fill.
    if (items.length === 0) items.push(emptyVisitItem());

    const draft: VisitDraft = {
        date: parseIsoDate(response.date),
        odometer:
            typeof response.odometer === "number" &&
            Number.isFinite(response.odometer) &&
            response.odometer > 0
                ? String(response.odometer)
                : "",
        workshop:
            typeof response.workshop === "string" ? response.workshop.trim() : "",
        updateCarOdometer: true,
        items,
    };

    return { draft, lowConfidenceCount, otherCount };
};
