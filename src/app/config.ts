/**
 * Runtime feature flags for Phase 3. [T22, T23]
 *
 * These knobs govern the AI intake feature. Kept in code (not env) so
 * changing them is a deploy the whole team can see, but structured
 * OUTSIDE the components that read them so a rollback needs no ripple
 * through UI code.
 *
 * ── scanEnabled ──────────────────────────────────────────────────────
 * The master switch. When `false`, no scan buttons render and the AI
 * Logic module is NEVER dynamically imported — the SDK doesn't load,
 * no App Check tokens are minted, no quota is consumed. This is the
 * BUILD-BEHIND-FLAG discipline: T22 and T23 are complete and correct
 * per AI1–AI5 and ODO1–ODO4, but the family sees nothing until Shirley
 * runs the T21 AI Studio gate and flips this.
 *
 * ── aiModel ──────────────────────────────────────────────────────────
 * Which Gemini model to call. [decision #22] Read at CALL time, not at
 * bundle time — so a churn in Gemini model ids doesn't need a deploy,
 * just an edit to this file and a merge. The default is a placeholder
 * until Shirley reports the winning model from the T21 gate.
 *
 * ── The default state ────────────────────────────────────────────────
 * `scanEnabled: false` on main. HANDOFF § 2 lists the steps to flip it.
 */

export const AI_CONFIG = {
    /** Master switch. See HANDOFF § 2 to enable. */
    scanEnabled: false,
    /**
     * Model id. Change this per T21's winning model — e.g.
     * `"gemini-2.5-flash"` or `"gemini-2.5-pro"`.
     */
    aiModel: "gemini-2.5-flash",
} as const;

export type AiConfig = typeof AI_CONFIG;
