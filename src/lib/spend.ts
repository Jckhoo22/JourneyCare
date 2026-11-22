import { toMoney } from "../utils/money";

/**
 * Spend arithmetic. [S1–S3]
 *
 * Pure — no Firebase, no React, no locale — exactly like `lib/nextDue.ts`, and
 * for the same reason: totals are the numbers a family will check against a
 * bank statement, so the rules that produce them should be testable without a
 * browser or an emulator.
 *
 * The DISPLAY side of T14 reads denormalised counters (`car.totalSpend`,
 * `group.spendByYear`) rather than summing history — that decision lives in
 * plan.md § Spend totals. What's here is the two places summation is still
 * correct: the by-type breakdown on the car page (over history the page has
 * already loaded) and the Recalculate action (which reads everything on
 * purpose).
 */

/** The key `spendByYear` buckets by: a calendar year in the user's timezone. [S2] */
export const spendYearOf = (date: Date): string => String(date.getFullYear());

/**
 * The key `spendByMonth` buckets by: `"YYYY-MM"` in the user's timezone. [SPD1]
 *
 * Local timezone rather than UTC for the same reason `parseLocalDate` reads
 * the log date as local midnight: a Malaysian family logs Malaysian months,
 * not UTC ones, and a January 1st entry crossing the boundary would bucket
 * against December on both sides of the world otherwise.
 */
export const spendMonthOf = (date: Date): string => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${date.getFullYear()}-${month}`;
};

/** The year the home strip reports on. Read at render — see the note in D1. */
export const currentYear = (now: Date = new Date()): string => spendYearOf(now);

/**
 * The twelve `"YYYY-MM"` keys of a given year, oldest first. [SPD3]
 *
 * Used by the group's monthly bar chart to enumerate the buckets to render —
 * a month with no spend simply looks up an absent key and renders zero.
 */
export const monthKeysOfYear = (year: string): string[] =>
    Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, "0");
        return `${year}-${month}`;
    });

/** One entry going into a breakdown: which bucket, what it's called, what it cost. */
export interface SpendEntry {
    key: string;
    label: string;
    cost: number;
}

/** One line coming out of a breakdown. */
export interface SpendLine {
    key: string;
    label: string;
    total: number;
    /** How many entries made this total — "RM 900" over 1 service reads very
        differently from the same figure over 9. */
    count: number;
}

/**
 * Biggest first, name as the tiebreak so the order is total and never
 * flickers between renders when two buckets hold the same amount.
 */
export const byTotalDesc = (
    a: { total: number; label: string },
    b: { total: number; label: string },
): number => b.total - a.total || a.label.localeCompare(b.label);

/**
 * Groups entries by key and totals each. [S1]
 *
 * Rounded per bucket rather than only at the end: the bucket totals are what
 * gets displayed, and a set of lines that don't visibly add up to the figure
 * above them is the kind of thing people stop trusting the app over.
 */
export const totalsByType = (entries: SpendEntry[]): SpendLine[] => {
    const buckets = new Map<string, SpendLine>();

    entries.forEach(({ key, label, cost }) => {
        const found = buckets.get(key);
        if (found) {
            found.total = toMoney(found.total + cost);
            found.count += 1;
        } else {
            buckets.set(key, { key, label, total: toMoney(cost), count: 1 });
        }
    });

    return [...buckets.values()].sort(byTotalDesc);
};

/** Adds up a column of money without letting float drift into the answer. */
export const sumMoney = (values: number[]): number =>
    toMoney(values.reduce((running, value) => running + value, 0));

/**
 * Whether two year-buckets hold the same thing. [T14 recalculate]
 *
 * Used to decide whether the recalculation actually needs to write. An empty
 * bucket and an absent one mean the same to every reader here, so a map with a
 * stray zero compares EQUAL to one without the key — otherwise Recalculate
 * would report a correction every single time it ran on a healthy group.
 */
export const sameSpendByYear = (
    a: Record<string, number> | undefined,
    b: Record<string, number> | undefined,
): boolean => {
    const left = a ?? {};
    const right = b ?? {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of keys) {
        if (toMoney(left[key] ?? 0) !== toMoney(right[key] ?? 0)) return false;
    }
    return true;
};

/**
 * Whether two "amount per key" maps agree. [T20 recalculate]
 *
 * Reused across `spendByMonth`, `spendByType` and any future denorm map — the
 * check is identical to `sameSpendByYear`, generalised. An empty bucket and
 * an absent one compare equal (same reason as the year-buckets version).
 */
export const sameAmountMap = (
    a: Record<string, number> | undefined,
    b: Record<string, number> | undefined,
): boolean => sameSpendByYear(a, b);
