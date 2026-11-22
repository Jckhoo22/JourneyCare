/**
 * Filtering a car's loaded maintenance history. [L6]
 *
 * Pure, like everything else in `lib/`: no Firebase, no React, no Timestamps.
 * The caller flattens a `Log` into the strings below (see `searchableLog` in
 * model/Log.ts) and this decides whether it matches.
 *
 * ## Why this filters in memory and never queries
 *
 * The history listener is bounded at 20 entries a page and `loadMore` widens
 * it. A search that hit Firestore would either need a second query per
 * keystroke — the read-amplification trap this project has already been bitten
 * by — or a composite index per searchable field, and Firestore has no
 * substring or full-text matching to build one on anyway. Filtering what is
 * already on the device costs nothing and cannot surprise anyone with a bill.
 *
 * The honest consequence: **search sees the loaded page, not the whole
 * history.** A term that matches nothing in the first 20 entries finds nothing
 * until more is loaded. The UI says so rather than letting an empty result
 * imply the service never happened.
 */

/** One log, flattened to the things a person would type looking for it. */
export interface SearchableLog {
    /** The type as displayed — the preset's label, or a custom one. */
    label: string;
    notes?: string;
    /** Ringgit, as stored. */
    cost: number;
    /** Who recorded it. */
    loggedBy?: string;
}

/**
 * Casefold and collapse whitespace.
 *
 * `toLowerCase` rather than `localeCompare`: this is a substring test over
 * names people typed, and a locale-aware collation would cost the simple
 * `includes` below without changing any answer at family scale.
 */
const normalise = (value: string): string =>
    value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The ways a number might be typed when looking for a cost.
 *
 * A log costing 150 is stored as `150` and displayed as "RM 150.00". Someone
 * hunting for it types "150", and someone scanning a receipt types "150.00" —
 * both have to work, so the haystack carries every rendering rather than the
 * query being parsed into one.
 */
const costForms = (cost: number): string[] => {
    const forms = [String(cost), cost.toFixed(2)];
    // "1500" and "1,500" are the same search to a human.
    const grouped = cost.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    forms.push(grouped, grouped.replace(/,/g, ""));
    return forms;
};

/**
 * A currency query means the same thing with or without its unit.
 * "rm150", "RM 150" and "150" all look for the same entry.
 */
const stripCurrency = (query: string): string =>
    query.replace(/^rm\s*/, "").replace(/,/g, "").trim();

/**
 * Does this entry match what was typed?
 *
 * An empty or whitespace-only query matches EVERYTHING, so the caller can pass
 * the raw field value straight through without special-casing the unfiltered
 * state.
 *
 * Multi-word queries are AND-ed across the whole record, not matched as one
 * phrase: "oil 90" finds an engine oil change that cost RM 90, even though
 * those two terms live in different fields and never appear adjacent. That is
 * how people search a list they can already see.
 */
export const matchesLog = (log: SearchableLog, query: string): boolean => {
    const terms = normalise(query)
        .split(" ")
        .filter(Boolean)
        // "RM 250" tokenises to ["rm", "250"], and requiring "rm" to appear
        // somewhere would fail every entry. A bare currency unit is not a
        // search term — it's punctuation on the number beside it. (A query of
        // "rm" alone therefore matches everything, which is the right answer
        // for a query that asks nothing.)
        .filter((term) => term !== "rm");
    if (terms.length === 0) return true;

    const haystack = [
        normalise(log.label),
        log.notes ? normalise(log.notes) : "",
        log.loggedBy ? normalise(log.loggedBy) : "",
        ...costForms(log.cost),
    ].join(" ");

    return terms.every((term) => {
        if (haystack.includes(term)) return true;
        // Give a currency-shaped term a second chance against the bare number.
        const bare = stripCurrency(term);
        return bare !== term && bare.length > 0 && haystack.includes(bare);
    });
};
