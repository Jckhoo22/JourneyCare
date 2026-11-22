import type { Locale } from "./English";

/**
 * Recursive Partial. Every leaf is optional, and every nested object may be
 * missing entire sub-trees. The translation files use this so a partial
 * dictionary still typechecks — missing strings fall back to English.
 */
export type PartialLocale = {
    [K in keyof Locale]?: Locale[K] extends string
        ? string
        : Locale[K] extends Record<string, unknown>
          ? { [P in keyof Locale[K]]?: Locale[K][P] }
          : Locale[K];
};

/**
 * Deep-merges a partial locale onto a full English base, string-by-string.
 *
 * Why deep-merge instead of "provide every string": the family reads Malay
 * and Chinese, but the strings behind niche error messages ("The join token
 * doesn't look right") change more often than they get read. Requiring 100%
 * coverage on every release would ossify the whole translation workflow. A
 * partial file plus this merge gives the LOUD strings translated attention
 * and the QUIET ones a stable English fallback that never crashes. Shirley
 * decides where the line goes.
 *
 * The English file remains the ONLY authoritative shape (`Locale = typeof
 * strings`). This function never adds keys, so a translation typo like
 * `logs.saveButton` for `logs.save` cannot silently create a new field —
 * `PartialLocale` requires every key to be one of English's.
 */
export const mergeLocale = (base: Locale, overrides: PartialLocale): Locale => {
    const result = { ...base } as Record<string, unknown>;
    for (const [key, sub] of Object.entries(overrides)) {
        if (sub === undefined || sub === null) continue;
        const baseValue = (base as unknown as Record<string, unknown>)[key];
        if (typeof sub === "object" && !Array.isArray(sub)) {
            result[key] = {
                ...(baseValue as Record<string, unknown>),
                ...(sub as Record<string, unknown>),
            };
        } else {
            result[key] = sub;
        }
    }
    return result as Locale;
};
