import catalogue from "../data/cars-my.json";
import presets from "../data/maintenance-types.json";

/**
 * The bundled brand → model → year list. [C2]
 *
 * Static JSON shipped with the app: no API, no key, no network call, and it
 * works offline. It is Malaysia-focused and deliberately not exhaustive — the
 * "Other" escape hatch takes free text for anything it misses, which is what
 * stops a curated list becoming a wall someone can't get past.
 */

export interface CatalogueModel {
    name: string;
    /** First model year sold here. */
    from: number;
    /** Present only for models no longer sold; absent means still current. */
    to?: number;
}

export interface CatalogueBrand {
    name: string;
    models: CatalogueModel[];
}

const brands = catalogue.brands as CatalogueBrand[];

/** The sentinel brand that switches the form to free text. */
export const OTHER_BRAND: string = catalogue.otherBrand;

/** Brand names for the first picker, with "Other" pinned last. */
export const brandNames = (): string[] => [
    ...brands.map((brand) => brand.name),
    OTHER_BRAND,
];

export const isOtherBrand = (brand: string): boolean => brand === OTHER_BRAND;

/** Models for a brand. Empty for "Other" (and for anything unrecognised). */
export const modelsForBrand = (brand: string): CatalogueModel[] =>
    brands.find((entry) => entry.name === brand)?.models ?? [];

export const findModel = (
    brand: string,
    model: string,
): CatalogueModel | undefined =>
    modelsForBrand(brand).find((entry) => entry.name === model);

/**
 * Selectable years for a model, newest first.
 *
 * The upper bound is the model's `to` when it has one, otherwise next year —
 * dealerships sell the coming model year before it arrives, and a picker that
 * can't express that is just wrong in December. `today` is injected so this
 * stays a pure function and the tests don't drift with the calendar.
 */
export const yearsForModel = (
    model: CatalogueModel | undefined,
    today: Date = new Date(),
): number[] => {
    const currentYear = today.getFullYear();
    const last = model?.to ?? currentYear + 1;
    const first = model?.from ?? 1980;

    const years: number[] = [];
    for (let year = last; year >= first; year--) years.push(year);
    return years;
};

/** Free-text years, for the "Other" path where no model is known. */
export const openYearRange = (today: Date = new Date()): number[] =>
    yearsForModel(undefined, today);

// ─── Maintenance presets [L3] ──────────────────────────────────────────────
//
// Loaded here rather than in a separate module so both bundled datasets have
// one typed front door. Consumed by T12's add-log form.

export interface MaintenancePreset {
    id: string;
    label: string;
    /** Which optgroup this sits in. [L3] */
    group: string;
    /** Default interval in kilometres, where the type has one. */
    km?: number;
    /** Default interval in months, where the type has one. */
    months?: number;
}

export interface MaintenanceGroup {
    id: string;
    label: string;
}

export const maintenancePresets = (): MaintenancePreset[] =>
    presets.types as MaintenancePreset[];

export const findPreset = (id: string): MaintenancePreset | undefined =>
    maintenancePresets().find((preset) => preset.id === id);

/** The sentinel for a type the presets don't cover. [L2] */
export const CUSTOM_TYPE = "custom";

export const isCustomType = (id: string): boolean => id === CUSTOM_TYPE;

/**
 * Presets arranged for the picker: groups in the order the data declares them,
 * types in the order they appear within each.
 *
 * The order is the data's, not this function's — "engine oil first" is a
 * product decision, and it belongs next to the intervals it describes rather
 * than buried in a sort comparator.
 */
export const presetsByGroup = (): Array<{
    group: MaintenanceGroup;
    types: MaintenancePreset[];
}> =>
    (presets.groups as MaintenanceGroup[])
        .map((group) => ({
            group,
            types: maintenancePresets().filter(
                (preset) => preset.group === group.id,
            ),
        }))
        .filter((entry) => entry.types.length > 0);
