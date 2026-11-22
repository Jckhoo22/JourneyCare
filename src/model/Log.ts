import type { FieldValue, Timestamp } from "firebase/firestore";

import { findPreset } from "./CarCatalogue";
import type { SearchableLog } from "../lib/logSearch";

/**
 * A maintenance log entry. [L1–L6]
 *
 * `groups/{groupId}/cars/{carId}/logs/{logId}`.
 *
 * Intervals are copied onto the entry rather than read from the preset at
 * display time, because L4 lets them be overridden per entry — and because a
 * preset's defaults may change in a later release, which must not silently
 * rewrite what someone recorded about a service that already happened.
 */
export interface LogDoc {
    /** A preset id from maintenance-types.json, or 'custom'. */
    type: string;
    /** Only for 'custom' — what the user called it. */
    customLabel?: string;
    /** Ringgit. Zero is legitimate: warranty work, or a favour. */
    cost: number;
    date: Timestamp | FieldValue;
    /** Reading at the time of service. Optional but encouraged. [L2] */
    odometer?: number;
    /** Resolved at log time, either from the preset or overridden. [L4] */
    intervalKm?: number;
    intervalMonths?: number;
    notes?: string;
    /** Denormalised so history renders without a lookup per row. [L5] */
    createdBy: { uid: string; username: string };
    createdAt: Timestamp | FieldValue;
}

export interface Log extends Omit<LogDoc, "date" | "createdAt"> {
    id: string;
    date: Timestamp | null;
    createdAt: Timestamp | null;
}

const asTimestamp = (value: unknown): Timestamp | null =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as Timestamp).toMillis === "function"
        ? (value as Timestamp)
        : null;

/** Reads a log snapshot defensively, as every other `to…` in the model does. */
export const toLog = (id: string, data: Partial<LogDoc>): Log => ({
    id,
    type: data.type ?? "custom",
    customLabel: data.customLabel?.trim() || undefined,
    cost: typeof data.cost === "number" ? data.cost : 0,
    date: asTimestamp(data.date),
    odometer: typeof data.odometer === "number" ? data.odometer : undefined,
    intervalKm: typeof data.intervalKm === "number" ? data.intervalKm : undefined,
    intervalMonths:
        typeof data.intervalMonths === "number" ? data.intervalMonths : undefined,
    notes: data.notes?.trim() || undefined,
    createdBy: {
        uid: data.createdBy?.uid ?? "",
        username: data.createdBy?.username?.trim() || "",
    },
    createdAt: asTimestamp(data.createdAt),
});

/**
 * What to call this entry.
 *
 * A custom entry uses its own label; a preset uses the shipped one, looked up
 * fresh so a wording fix reaches old entries. An unrecognised id — a preset
 * retired since — falls back to the stored label or the raw id rather than
 * rendering blank.
 */
export const logTypeLabel = (log: Log): string => {
    if (log.type === "custom") return log.customLabel || "Something else";
    return findPreset(log.type)?.label ?? log.customLabel ?? log.type;
};

/**
 * A log flattened for the history search. [L6]
 *
 * Lives here rather than in `lib/logSearch.ts` because it needs
 * `logTypeLabel`, and that is a model concern — the lib stays pure and takes
 * plain strings.
 *
 * Note what is NOT searchable, because it does not exist: **there is no
 * workshop field on a log.** The document is
 * `{type, customLabel, cost, date, odometer, intervalKm, intervalMonths,
 * notes, createdBy, createdAt}` and the rules whitelist pins it. Where people
 * record a workshop today they write it in `notes`, which this does search —
 * so workshop search works in practice without a schema change.
 */
export const searchableLog = (log: Log): SearchableLog => ({
    label: logTypeLabel(log),
    notes: log.notes,
    cost: log.cost,
    loggedBy: log.createdBy.username || undefined,
});

/** "12 Mar 2026" */
export const formatLogDate = (log: Log): string =>
    log.date
        ? log.date.toDate().toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
          })
        : "";

/**
 * The denormalised summary of one service, as stored in `car.lastByType`.
 * [T13 reads this]
 */
export interface LastServiceSummary {
    date: Timestamp;
    customLabel?: string;
    odometer?: number;
    intervalKm?: number;
    intervalMonths?: number;
}

/**
 * Reduces a log to what `lastByType` keeps.
 *
 * Only the fields next-due needs: the date and odometer it happened at, and
 * the interval that was in force. Cost and notes stay in the entry — copying
 * them here would be a second source of truth for something already stored.
 */
export const toLastService = (
    date: Timestamp,
    log: Pick<Log, "odometer" | "intervalKm" | "intervalMonths" | "customLabel">,
): LastServiceSummary => ({
    date,
    ...(log.customLabel ? { customLabel: log.customLabel } : {}),
    ...(log.odometer !== undefined ? { odometer: log.odometer } : {}),
    ...(log.intervalKm !== undefined ? { intervalKm: log.intervalKm } : {}),
    ...(log.intervalMonths !== undefined
        ? { intervalMonths: log.intervalMonths }
        : {}),
});

const CUSTOM_REMINDER_PREFIX = "custom:";

/** A Firestore update path segment cannot contain a literal dot. */
export const serviceReminderKey = ({ type, customLabel }: Pick<Log, "type" | "customLabel">): string => {
    if (type !== "custom" || !customLabel?.trim()) return type;
    const key = customLabel.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
    return CUSTOM_REMINDER_PREFIX + encodeURIComponent(key)
        .replaceAll(".", "%2E").replaceAll("*", "%2A").replaceAll("~", "%7E");
};

export const customReminderLabel = (key: string): string | undefined => {
    if (!key.startsWith(CUSTOM_REMINDER_PREFIX)) return undefined;
    try {
        return decodeURIComponent(key.slice(CUSTOM_REMINDER_PREFIX.length));
    } catch {
        return undefined;
    }
};

type ServiceOrder = Pick<Log, "id" | "date" | "createdAt">;

export const compareServiceOrder = (a: ServiceOrder, b: ServiceOrder): number =>
    (a.date?.toMillis() ?? -1) - (b.date?.toMillis() ?? -1) ||
    (a.createdAt?.toMillis() ?? -1) - (b.createdAt?.toMillis() ?? -1) ||
    (a.id > b.id ? 1 : a.id < b.id ? -1 : 0);

/**
 * Parses a date input's `YYYY-MM-DD` as LOCAL midnight.
 *
 * `new Date("2026-07-27")` parses as UTC midnight, which in UTC+8 is 08:00 —
 * so someone logging a service at 00:30 on the 27th would produce a timestamp
 * hours in the FUTURE, and the `date <= request.time` rule would refuse it.
 * Local midnight is both what the user meant and always safely in the past.
 */
export const parseLocalDate = (value: string): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;

    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
};

/** Today as `YYYY-MM-DD` in the user's own timezone — the input's default and max. */
export const todayInputValue = (now: Date = new Date()): string => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
