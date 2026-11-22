import type { Car } from "./Car";
import { findPreset } from "./CarCatalogue";
import { customReminderLabel } from "./Log";
import type { Locale } from "../locale/English";
import {
    nextDueForCar,
    type DueItem,
    type DueStatus,
    type LastService,
} from "../lib/nextDue";

/**
 * The boundary between Firestore and the pure next-due lib. [R1]
 *
 * `lib/nextDue.ts` deliberately knows nothing about Firebase, so the Timestamps
 * in `car.lastByType` are converted to plain Dates exactly here — one place,
 * rather than a `.toDate()` scattered through every component that wants a
 * badge.
 */

/** `car.lastByType` in the shape the lib accepts. */
export const carLastServices = (car: Car): Record<string, LastService> => {
    const result: Record<string, LastService> = {};

    Object.entries(car.lastByType).forEach(([type, entry]) => {
        // A pending server timestamp reads back as null for a moment; a type
        // with no usable date can't be scheduled from.
        const date = entry?.date?.toDate?.();
        if (!date) return;

        result[type] = {
            date,
            ...(typeof entry.odometer === "number"
                ? { odometer: entry.odometer }
                : {}),
            ...(typeof entry.intervalKm === "number"
                ? { intervalKm: entry.intervalKm }
                : {}),
            ...(typeof entry.intervalMonths === "number"
                ? { intervalMonths: entry.intervalMonths }
                : {}),
        };
    });

    return result;
};

/** Everything due on one car, most urgent first. [R1, R3] */
export const dueForCar = (car: Car, now: Date = new Date()): DueItem[] =>
    nextDueForCar(carLastServices(car), car.odometer, now);

/** The label a service type shows under — the preset's, or the raw id. */
export const dueTypeLabel = (type: string, car?: Car): string =>
    car?.lastByType[type]?.customLabel ?? findPreset(type)?.label ?? customReminderLabel(type) ?? type;

/** "15 Aug 2026" */
const formatDueDate = (date: Date): string =>
    date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });

/**
 * "Due by 15 Aug 2026 or at 52,000 km" — the R1 wording.
 *
 * Both parts when both intervals exist, because "whichever comes first" is
 * only meaningful if the reader can see both numbers. When the car has no
 * current reading the km half still appears: it's a fact worth knowing even
 * though nothing can say whether it has been passed.
 */
export const formatDue = (item: DueItem, locale: Locale): string => {
    const parts: string[] = [];

    if (item.dueDate) {
        parts.push(locale.due.byDate.replace("{date}", formatDueDate(item.dueDate)));
    }
    if (item.dueKm !== undefined) {
        parts.push(
            locale.due.atKm.replace("{km}", item.dueKm.toLocaleString()),
        );
    }

    return parts.join(locale.due.join);
};

/** The word for a status, for badges and screen readers. */
export const statusLabel = (status: DueStatus, locale: Locale): string => {
    if (status === "OVERDUE") return locale.due.overdue;
    if (status === "DUE_SOON") return locale.due.dueSoon;
    return locale.due.ok;
};

/** Maps a status onto its CSS modifier — the status tokens, never the accent. */
export const statusClass = (status: DueStatus): string =>
    status === "OVERDUE"
        ? "due-overdue"
        : status === "DUE_SOON"
          ? "due-soon"
          : "due-ok";
