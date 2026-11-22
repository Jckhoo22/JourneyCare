import type { LogDraft } from "../controller/LogsController";

/**
 * A workshop visit as a plain serializable object. [V1, V4]
 *
 * The interface both manual entry and AI intake fill. Kept intentionally
 * primitive — strings and numbers only — so the receipt-scan module (T22) can
 * hand one back from a JSON parse without a bridge layer, and so an odd draft
 * can be dumped to console for debugging.
 *
 * A visit is one date, one workshop, one shared odometer reading, and N items.
 * That matches how a family experiences a service: one trip to the workshop
 * that produced one receipt for several things done at once. Storage remains
 * per-item (each row becomes its own `logs/{logId}` document) so history,
 * search, and the by-type breakdown all work unchanged.
 */
export interface VisitDraft {
    /** `YYYY-MM-DD`, parsed as LOCAL midnight (same rule as LogDraft). */
    date: string;
    /** Shared reading at the workshop. Copied onto every item. */
    odometer: string;
    /**
     * Where it happened. Copied into each item's `notes` prefix so the
     * existing search (which never got a workshop schema field) can still
     * find it. See CONTEXT.md § A query that doesn't mirror its read rule.
     */
    workshop: string;
    /** Also update the car's current reading to `odometer`. */
    updateCarOdometer: boolean;
    /** N line items — at least one; empty items are dropped at resolve time. */
    items: VisitItemDraft[];
    /**
     * When set, this visit is installing a shelf part. [PRT4]
     *
     * The first non-shelf item in the resolved list becomes the install log
     * — its id is what gets written to `parts/{partId}.installedLogId`, and
     * the part's status flips on_hand → installed in the SAME batch.
     *
     * The part is not RE-COUNTED in the visit's spend: the flip happens
     * inside `createVisit`, which already sums the visit's costs into the
     * denorm — the shelf part becomes a log line the same as any other, with
     * whatever cost the user typed. That matches decision #25 exactly: spend
     * counts at install, once.
     */
    installingPartId?: string;
}

/**
 * One line on a visit. [V1]
 *
 * `type`, `cost`, and optional interval override are the fields V1 names
 * explicitly. Everything else is either shared (date, odometer, workshop) or
 * derived at save time.
 *
 * `notes` is per-line so a receipt scan can carry through free text — a normal
 * manual visit leaves this blank and the shared `workshop` above fills the
 * search-relevant field.
 *
 * `partsShelf` is the PRT5 toggle: when true, this line stocks the shelf
 * rather than logging a service. T18 wires the flag to the parts subcollection
 * write; T17 accepts the field and simply ignores it (the item is not
 * converted to a log). AI intake carries it through (AI4).
 *
 * `confidence` and `rawText` are populated by AI intake (AI3). Manual entry
 * leaves them blank. Neither is written to Firestore — they exist only to
 * flag low-confidence rows in the pre-fill for user review.
 */
export interface VisitItemDraft {
    type: string;
    customLabel: string;
    cost: string;
    intervalKm: string;
    intervalMonths: string;
    notes: string;
    /** [PRT5, T18] Toggled at write time; a true value routes to the shelf. */
    partsShelf: boolean;
    /** [AI3, T22] "low" flags for user review; never persisted. */
    confidence?: "high" | "low";
    /** [AI3, T22] What the model read on this line, verbatim. Not persisted. */
    rawText?: string;
}

/** An empty item, ready to add to a visit. */
export const emptyVisitItem = (): VisitItemDraft => ({
    type: "",
    customLabel: "",
    cost: "",
    intervalKm: "",
    intervalMonths: "",
    notes: "",
    partsShelf: false,
});

/**
 * Reduces a visit to a list of `LogDraft`s and a parts-shelf list, folding the
 * shared date/odometer/workshop into each item. [V2, PRT5]
 *
 * `workshop` is prepended to each item's `notes` because the log document has
 * no workshop field (see the note on `searchableLog` in `model/Log.ts`) — this
 * is what keeps the search working over multi-item visits without a schema
 * change. An item with its own `notes` gets both, workshop-first.
 *
 * PRT5-flagged items are separated out for T18's parts write; T17 does nothing
 * with them (see the controller — they're not turned into logs).
 */
export interface ResolvedVisit {
    logs: Array<{ index: number; draft: LogDraft }>;
    /** [PRT5, T18] Items that stock the shelf rather than logging a service. */
    partsToShelve: Array<{ index: number; draft: VisitItemDraft }>;
}

export const resolveVisit = (draft: VisitDraft): ResolvedVisit => {
    const workshopPrefix = draft.workshop.trim();

    const logs: ResolvedVisit["logs"] = [];
    const partsToShelve: ResolvedVisit["partsToShelve"] = [];

    for (const [index, item] of draft.items.entries()) {
        if (isBlankItem(item)) continue;

        if (item.partsShelf) {
            partsToShelve.push({ index, draft: item });
            continue;
        }

        const itemNotes = item.notes.trim();
        const combinedNotes = [workshopPrefix, itemNotes]
            .filter(Boolean)
            .join(" — ");

        logs.push({ index, draft: {
            type: item.type,
            customLabel: item.customLabel,
            cost: item.cost,
            date: draft.date,
            odometer: draft.odometer,
            intervalKm: item.intervalKm,
            intervalMonths: item.intervalMonths,
            notes: combinedNotes,
            updateCarOdometer: draft.updateCarOdometer,
        } });
    }

    return { logs, partsToShelve };
};

/** A row a user added and then left empty is not a validation error. */
const isBlankItem = (item: VisitItemDraft): boolean =>
    !item.type.trim() &&
    !item.customLabel.trim() &&
    !item.cost.trim() &&
    !item.notes.trim();
