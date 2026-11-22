/**
 * Firebase AI Logic bridge. [T22, T23, AI2, decision #19, decision #22]
 *
 * ── The whole file is behind a dynamic import boundary ────────────────
 * `firebase/ai` is a substantial module. Loading it into every page
 * bundle just for a scan button that may never be tapped is exactly
 * the kind of read-amplification we've been avoiding elsewhere. This
 * file is intentionally the ONLY entry point that touches
 * `firebase/ai`, and it is imported dynamically at first tap by the
 * component that renders the scan button.
 *
 * ── Backend: Gemini Developer API, NOT Vertex ─────────────────────────
 * `GoogleAIBackend` is Spark-tier friendly. `VertexAIBackend` requires
 * Blaze billing. Do not import `VertexAIBackend` here, and do not
 * change the argument to `getAI` — decision #19 is a cost boundary,
 * not a design preference.
 *
 * ── Model id from config, not code ────────────────────────────────────
 * `AI_CONFIG.aiModel` is read at CALL time so a model-id churn is a
 * config edit + merge, not a deploy of this file. Decision #22.
 *
 * ── App Check ─────────────────────────────────────────────────────────
 * Firebase AI Logic requires App Check for every model call. This
 * bridge assumes App Check is initialised elsewhere (see
 * `configurations/firebase-config.ts`). Local dev needs the debug
 * provider token — HANDOFF.md § 1 documents the setup.
 */

import { app } from "../configurations/firebase-config";
import { AI_CONFIG } from "../app/config";
import { RECEIPT_PROMPT, ODOMETER_PROMPT } from "./aiPrompts";
import { parseReceipt, type ParsedReceipt } from "./aiReceiptParser";
import { parseOdometer, type ParsedOdometer } from "./aiOdometerParser";

/**
 * Named failure modes matching AI4's fallback matrix. The caller
 * translates each into a specific UX branch — never a raw error.
 */
export type AiFailure =
    | { kind: "unreadable" }
    | { kind: "quota" }
    | { kind: "network" }
    | { kind: "malformed" };

/**
 * The JPEG data URL → { model call → JSON → parse } pipeline for a
 * receipt scan. Never throws — every failure returns an `AiFailure`.
 */
export const scanReceipt = async (
    jpegDataUrl: string,
): Promise<
    | { ok: true; result: ParsedReceipt }
    | { ok: false; failure: AiFailure }
> => {
    try {
        const { getAI, getGenerativeModel, GoogleAIBackend } = await import(
            "firebase/ai"
        );
        const ai = getAI(app, { backend: new GoogleAIBackend() });
        const model = getGenerativeModel(ai, { model: AI_CONFIG.aiModel });

        const [, base64] = jpegDataUrl.split(",");
        if (!base64) return { ok: false, failure: { kind: "unreadable" } };

        const response = await model.generateContent([
            RECEIPT_PROMPT,
            {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: base64,
                },
            },
        ]);

        const text = response.response.text();
        if (!text || !text.trim()) {
            return { ok: false, failure: { kind: "unreadable" } };
        }

        const parsed = parseReceipt(text);
        if (!parsed) return { ok: false, failure: { kind: "malformed" } };

        return { ok: true, result: parsed };
    } catch (error: unknown) {
        console.error("scanReceipt error:", error);
        return { ok: false, failure: classify(error) };
    }
};

/**
 * The odometer version. [T23, ODO2] Same shape as scanReceipt — the
 * caller doesn't need to know which prompt or which parser was used.
 */
export const scanOdometer = async (
    jpegDataUrl: string,
): Promise<
    | { ok: true; result: ParsedOdometer }
    | { ok: false; failure: AiFailure }
> => {
    try {
        const { getAI, getGenerativeModel, GoogleAIBackend } = await import(
            "firebase/ai"
        );
        const ai = getAI(app, { backend: new GoogleAIBackend() });
        const model = getGenerativeModel(ai, { model: AI_CONFIG.aiModel });

        const [, base64] = jpegDataUrl.split(",");
        if (!base64) return { ok: false, failure: { kind: "unreadable" } };

        const response = await model.generateContent([
            ODOMETER_PROMPT,
            {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: base64,
                },
            },
        ]);

        const text = response.response.text();
        if (!text || !text.trim()) {
            return { ok: false, failure: { kind: "unreadable" } };
        }

        const parsed = parseOdometer(text);
        if (!parsed) return { ok: false, failure: { kind: "malformed" } };

        return { ok: true, result: parsed };
    } catch (error: unknown) {
        console.error("scanOdometer error:", error);
        return { ok: false, failure: classify(error) };
    }
};

/**
 * Maps an SDK error onto the AI4 fallback matrix. Deliberately loose —
 * the error shapes we see from `firebase/ai` are not stable in strict
 * types, so this pattern-matches the common signatures rather than
 * relying on typed unions.
 */
const classify = (error: unknown): AiFailure => {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (
        message.includes("quota") ||
        message.includes("rate limit") ||
        message.includes("429")
    ) {
        return { kind: "quota" };
    }
    if (
        message.includes("network") ||
        message.includes("fetch") ||
        message.includes("offline")
    ) {
        return { kind: "network" };
    }
    return { kind: "unreadable" };
};
