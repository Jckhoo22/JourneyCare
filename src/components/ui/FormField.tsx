/**
 * FormField primitive. [UX pass R2, R5]
 *
 * Re-exports the existing `AuthTextField` and `SelectField` under a clean
 * `ui/` origin so callers stop reaching into `login_register/` and `form/`
 * for form primitives. The wrapped components already:
 *   — put the label above the input
 *   — apply `font-size: max(--text-body, 16px)` so iOS never zooms on focus
 *   — draw a visible focus ring via `:focus-visible` on the base rule
 *   — render error text below the input in red via `.field-error-text`
 *
 * Kept as a re-export rather than a rewrite so nothing shifts visually in
 * Phase 1. Phase 2 can evolve the underlying components without touching
 * every caller.
 */

export { default as TextField } from "../login_register/AuthTextField";
export { default as SelectField } from "../form/SelectField";
export type { SelectGroup, SelectOption } from "../form/SelectField";
