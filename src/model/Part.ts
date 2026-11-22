import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * A spare part on the shelf, or one that was installed. [PRT1, PRT3, PRT4]
 *
 * `groups/{groupId}/cars/{carId}/parts/{partId}`.
 *
 * A part comes in one of two states:
 *
 *   on_hand    Purchased, on the shelf, not on the car. Affects NOTHING —
 *              no timer, no next-due, no bar chart, no spend denorm.
 *              `purchaseDate` is informational only. [PRT3]
 *   installed  Fitted to the car in a specific service. The timer, the
 *              denorm, and the next-due date all count from the linked log's
 *              date and odometer, NOT from `purchaseDate`. [PRT4]
 *
 * `installedLogId` pins the log that installed it. Deleting that log reverts
 * the part to `on_hand` in the same batch, which is why a shelf part cost is
 * immutable after install (it already made it into the denorm). [PRT6, PRT7]
 *
 * Type discipline mirrors the maintenance-types.json contract:
 *   - `typeId` is a preset id (e.g. "engine_oil"), OR
 *   - `typeId === "custom"` and `customName` carries the free text
 * The two-field split, rather than one union, matches the log document so
 * the same catalogue helpers work on both.
 */
export interface PartDoc {
    /** A preset id from maintenance-types.json, or "custom". */
    typeId: string;
    /** Only for "custom" — what the user called it. */
    customName?: string;
    /**
     * A short user-supplied label to distinguish two of the same type on
     * the shelf ("brand X 5W-30", "brand Y 5W-40"). Optional; if absent
     * the type label is used.
     */
    label?: string;
    /** RM. Zero is legitimate (favour, warranty spare). */
    cost: number;
    /** Informational only, not a timer start. [PRT3] */
    purchaseDate: Timestamp | FieldValue;
    notes?: string;
    /** [PRT1] */
    status: "on_hand" | "installed";
    /**
     * The log this part was installed by. Present only when
     * `status === "installed"`; deleting that log reverts to on_hand
     * in the same batch. [PRT4, PRT6]
     */
    installedLogId?: string;
    createdBy: string;
    createdAt: Timestamp | FieldValue;
}

/** A parts document paired with its id, as the UI consumes it. */
export interface Part extends Omit<PartDoc, "purchaseDate" | "createdAt"> {
    id: string;
    purchaseDate: Timestamp | null;
    createdAt: Timestamp | null;
}

const asTimestamp = (value: unknown): Timestamp | null =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as Timestamp).toMillis === "function"
        ? (value as Timestamp)
        : null;

/** Reads a part snapshot defensively. */
export const toPart = (id: string, data: Partial<PartDoc>): Part => ({
    id,
    typeId: data.typeId ?? "custom",
    customName: data.customName?.trim() || undefined,
    label: data.label?.trim() || undefined,
    cost: typeof data.cost === "number" ? data.cost : 0,
    purchaseDate: asTimestamp(data.purchaseDate),
    notes: data.notes?.trim() || undefined,
    status: data.status === "installed" ? "installed" : "on_hand",
    installedLogId: data.installedLogId?.trim() || undefined,
    createdBy: data.createdBy ?? "",
    createdAt: asTimestamp(data.createdAt),
});

/**
 * The total value of shelf-only parts. [PRT2]
 *
 * `installed` parts are excluded — they already contribute to the car's
 * `totalSpend` via the install log. Double-counting them here would break
 * decision #25 (one accounting path).
 */
export const shelfValue = (parts: Part[]): number =>
    parts
        .filter((part) => part.status === "on_hand")
        .reduce((sum, part) => sum + part.cost, 0);

/** Parts currently on the shelf, newest first. [PRT2] */
export const onHandParts = (parts: Part[]): Part[] =>
    parts
        .filter((part) => part.status === "on_hand")
        .sort((a, b) => {
            const at = a.createdAt?.toMillis() ?? 0;
            const bt = b.createdAt?.toMillis() ?? 0;
            return bt - at;
        });
