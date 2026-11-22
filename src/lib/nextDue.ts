/**
 * When is each service next due? [R1, R2]
 *
 * Pure functions, no Firebase, no React, no clock of its own — `now` is always
 * passed in. That is what makes every edge case below testable, and it is the
 * reason this lives in `lib/` rather than in a controller.
 *
 * The input is `car.lastByType`, the denormalisation T12 maintains, converted
 * to plain Dates at the boundary. Status therefore needs **no log-history
 * reads at all**: a car card, a group page and the home strip can each render
 * a badge from data they already hold. [CONTEXT read-amplification lesson]
 */

/** [R2] */
export type DueStatus = "OK" | "DUE_SOON" | "OVERDUE";

/** Which dimensions this type's reminder is computed from. */
export type DueBasis = "date" | "km" | "both" | "none";

/** Within a month, or within a thousand kilometres. [R2] */
export const DUE_SOON_DAYS = 30;
export const DUE_SOON_KM = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One service type's last-recorded state, as plain values. */
export interface LastService {
    /** When it was last done. */
    date: Date;
    /** The reading it was done at, if one was recorded. */
    odometer?: number;
    /** The interval in force for that entry — possibly overridden. [L4] */
    intervalKm?: number;
    intervalMonths?: number;
}

export interface DueItem {
    /** Preset id, or 'custom'. */
    type: string;
    /** Present when a months interval and a last date exist. */
    dueDate?: Date;
    /** Present when a km interval AND a recorded service odometer exist. */
    dueKm?: number;
    status: DueStatus;
    basis: DueBasis;
    /**
     * True when a km target exists but the car has no current reading, so the
     * km side can't contribute a status. The UI still shows "at 52,000 km" —
     * it just can't say whether that's passed. [R2]
     */
    kmStatusUnknown: boolean;
}

/**
 * Adds whole months, clamping rather than rolling over.
 *
 * 31 January + 1 month is 28 February, not 3 March. JavaScript's `setMonth`
 * does the roll-over, which would quietly report a service due days later than
 * it is — the kind of wrong that nobody notices and everybody trusts.
 */
export const addMonths = (date: Date, months: number): Date => {
    const day = date.getDate();
    const shifted = new Date(date.getTime());

    shifted.setDate(1);
    shifted.setMonth(shifted.getMonth() + months);

    const lastOfMonth = new Date(
        shifted.getFullYear(),
        shifted.getMonth() + 1,
        0,
    ).getDate();
    shifted.setDate(Math.min(day, lastOfMonth));

    return shifted;
};

/** Worse of two statuses. OVERDUE beats DUE_SOON beats OK. */
const RANK: Record<DueStatus, number> = { OK: 0, DUE_SOON: 1, OVERDUE: 2 };

export const worseStatus = (a: DueStatus, b: DueStatus): DueStatus =>
    RANK[a] >= RANK[b] ? a : b;

const statusFromDate = (dueDate: Date, now: Date): DueStatus => {
    const remainingDays = (dueDate.getTime() - now.getTime()) / DAY_MS;
    if (remainingDays < 0) return "OVERDUE";
    return remainingDays <= DUE_SOON_DAYS ? "DUE_SOON" : "OK";
};

const statusFromKm = (dueKm: number, odometer: number): DueStatus => {
    const remaining = dueKm - odometer;
    if (remaining < 0) return "OVERDUE";
    return remaining <= DUE_SOON_KM ? "DUE_SOON" : "OK";
};

/**
 * One type's next-due state.
 *
 * Returns null when the type carries no interval at all — R1 only covers types
 * with one, and a service with no interval is a record of something that
 * happened, not a promise about something that will.
 *
 * With both intervals it is **whichever comes first**: the status is the worse
 * of the two, so a car that has run out of kilometres is overdue even if its
 * date is months away.
 */
export const nextDueForType = (
    type: string,
    last: LastService,
    currentOdometer: number | undefined,
    now: Date,
): DueItem | null => {
    const hasDate = typeof last.intervalMonths === "number";
    // A km interval is useless without knowing what reading it counts from.
    const hasKm =
        typeof last.intervalKm === "number" && typeof last.odometer === "number";

    if (!hasDate && !hasKm) return null;

    const dueDate = hasDate
        ? addMonths(last.date, last.intervalMonths!)
        : undefined;
    const dueKm = hasKm ? last.odometer! + last.intervalKm! : undefined;

    const dateStatus = dueDate ? statusFromDate(dueDate, now) : null;
    const kmStatus =
        dueKm !== undefined && currentOdometer !== undefined
            ? statusFromKm(dueKm, currentOdometer)
            : null;

    const contributions = [dateStatus, kmStatus].filter(
        (value): value is DueStatus => value !== null,
    );

    return {
        type,
        ...(dueDate ? { dueDate } : {}),
        ...(dueKm !== undefined ? { dueKm } : {}),
        // Nothing could be judged — a km-only reminder on a car with no
        // current reading. Say OK rather than inventing urgency.
        status: contributions.reduce(worseStatus, "OK" as DueStatus),
        basis:
            hasDate && hasKm ? "both" : hasDate ? "date" : hasKm ? "km" : "none",
        kmStatusUnknown: dueKm !== undefined && currentOdometer === undefined,
    };
};

/** Every type on a car that has a reminder, most urgent first. [R1, R3] */
export const nextDueForCar = (
    lastByType: Record<string, LastService>,
    currentOdometer: number | undefined,
    now: Date,
): DueItem[] =>
    Object.entries(lastByType)
        .map(([type, last]) =>
            nextDueForType(type, last, currentOdometer, now),
        )
        .filter((item): item is DueItem => item !== null)
        .sort(sortByUrgency);

/** Countdown and elapsed share of the most-used interval. */
export const dueCountdown = (
    item: DueItem,
    last: LastService,
    currentOdometer: number | undefined,
    now: Date,
) => {
    const dateRemaining = item.dueDate?.getTime();
    const remainingMs = dateRemaining === undefined
        ? undefined
        : dateRemaining - now.getTime();
    const remainingKm = item.dueKm === undefined || currentOdometer === undefined
        ? undefined
        : item.dueKm - currentOdometer;
    const dateInterval = dateRemaining === undefined
        ? 0
        : dateRemaining - last.date.getTime();
    const kmInterval = last.intervalKm ?? 0;
    const elapsed = Math.max(
        0,
        remainingMs === undefined || dateInterval <= 0 ? 0 : 1 - remainingMs / dateInterval,
        remainingKm === undefined || kmInterval <= 0 ? 0 : 1 - remainingKm / kmInterval,
    );

    return {
        days: remainingMs === undefined
            ? undefined
            : Math.sign(remainingMs) * Math.ceil(Math.abs(remainingMs) / DAY_MS),
        km: remainingKm,
        progress: Math.min(100, Math.round(elapsed * 100)),
    };
};

/**
 * Most urgent first: worse status wins, then the nearer due date, then the
 * type id so the order is total and never flickers between renders.
 */
export const sortByUrgency = (a: DueItem, b: DueItem): number => {
    if (RANK[a.status] !== RANK[b.status]) return RANK[b.status] - RANK[a.status];

    const aAt = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bAt = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aAt !== bAt) return aAt - bAt;

    return a.type.localeCompare(b.type);
};

/** The worst status across a car's types — what a card's badge shows. [C10] */
export const worstStatus = (items: DueItem[]): DueStatus =>
    items.reduce<DueStatus>((worst, item) => worseStatus(worst, item.status), "OK");

/** Only what someone needs to act on. [R3] */
export const needsAttention = (items: DueItem[]): DueItem[] =>
    items.filter((item) => item.status !== "OK");

/** Counts for the home strip. [R3] */
export interface DueTally {
    dueSoon: number;
    overdue: number;
}

export const EMPTY_TALLY: DueTally = { dueSoon: 0, overdue: 0 };

export const tally = (items: DueItem[]): DueTally => ({
    dueSoon: items.filter((item) => item.status === "DUE_SOON").length,
    overdue: items.filter((item) => item.status === "OVERDUE").length,
});

export const addTallies = (a: DueTally, b: DueTally): DueTally => ({
    dueSoon: a.dueSoon + b.dueSoon,
    overdue: a.overdue + b.overdue,
});

export const tallyTotal = (value: DueTally): number =>
    value.dueSoon + value.overdue;

/**
 * ─── The dedupe [R4] ────────────────────────────────────────────────────────
 *
 * `statusStamp` on the car records the status each type was last NOTIFIED at.
 * Everything below is pure so the one property that matters can be tested
 * without a database: rendering the same situation twice must produce nothing
 * the second time.
 */

/** What a stamp may hold. OK is absence — a type that recovers leaves the map. */
export type StampValue = "due_soon" | "overdue";

export const stampFor = (status: Exclude<DueStatus, "OK">): StampValue =>
    status === "OVERDUE" ? "overdue" : "due_soon";

export interface DueTransition {
    type: string;
    status: Exclude<DueStatus, "OK">;
    item: DueItem;
}

export interface DueChanges {
    /** Crossings worth a notification. Empty when nothing has moved. */
    transitions: DueTransition[];
    /** Types that fell back to OK, or vanished — stamps to drop, silently. */
    cleared: string[];
}

/**
 * What has changed since the last time this car was looked at.
 *
 * Three cases, and the middle one is the whole point:
 *
 *   not stamped, now due          → a transition (OK → DUE_SOON / OVERDUE)
 *   stamped at the same status    → NOTHING. Opening the app again is not news.
 *   stamped due_soon, now overdue → a transition (it got worse)
 *
 * Recovering from due back to OK is `cleared`, not a transition: "you no
 * longer need to do this" is not worth a notification, but the stamp has to go
 * or the next crossing would be mistaken for a repeat.
 */
export const detectChanges = (
    items: DueItem[],
    stamp: Record<string, string>,
): DueChanges => {
    const transitions = needsAttention(items)
        .map((item) => ({
            type: item.type,
            status: item.status as Exclude<DueStatus, "OK">,
            item,
        }))
        .filter((entry) => stamp[entry.type] !== stampFor(entry.status));

    const cleared = Object.keys(stamp).filter((type) => {
        const current = items.find((item) => item.type === type);
        return !current || current.status === "OK";
    });

    return { transitions, cleared };
};

/** The stamp a car should carry once these changes are recorded. */
export const nextStamp = (
    stamp: Record<string, string>,
    changes: DueChanges,
): Record<string, StampValue> => {
    const result: Record<string, StampValue> = {};

    Object.entries(stamp).forEach(([type, value]) => {
        if (value === "due_soon" || value === "overdue") result[type] = value;
    });

    changes.transitions.forEach((entry) => {
        result[entry.type] = stampFor(entry.status);
    });
    changes.cleared.forEach((type) => delete result[type]);

    return result;
};

/** Nothing to write — the common case on every app open after the first. */
export const hasNoChanges = (changes: DueChanges): boolean =>
    changes.transitions.length === 0 && changes.cleared.length === 0;
