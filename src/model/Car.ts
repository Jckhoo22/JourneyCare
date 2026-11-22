import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * Per-car access. [C6]
 *
 * Only one grade is stored, because only one needs to be: every group member
 * can already VIEW every car (the view floor), so the map's job is solely to
 * record who has been elevated to `edit`. Absence means view.
 *
 * The car's creator and the group's owner hold edit *implicitly* and are
 * deliberately NOT written into this map — putting them there would make the
 * map a second, drift-prone source of truth for something the car document
 * already knows. `hasCarEdit` below is the only place that decision lives, and
 * firestore.rules § cars mirrors it.
 */
export type CarAccess = Record<string, "edit">;

/** Denormalised last-service-per-type. Populated in T12; empty until then. */
export interface LastServiceEntry {
    date: Timestamp;
    customLabel?: string;
    odometer?: number;
    intervalKm?: number;
    intervalMonths?: number;
}

/** Most recent service with the same reading as the current odometer. */
export const lastMatchingOdometerService = (car: Car): Timestamp | undefined => {
    if (car.odometer === undefined) return undefined;
    return Object.values(car.lastByType).reduce<Timestamp | undefined>((latest, service) => {
        const date = service.date;
        return service.odometer === car.odometer && date &&
            (!latest || date.toMillis() > latest.toMillis())
            ? date
            : latest;
    }, undefined);
};

/** Next-due status stamp, for notification dedupe. Populated in T13. */
export type CarStatusStamp = Record<string, "due_soon" | "overdue">;

/**
 * How large a stored photo may be, measured in CHARACTERS of the data URL —
 * because that string is what actually occupies the document, and characters
 * are what firestore.rules can measure. [C5, D4, S6]
 *
 * Base64 inflates by 4/3, so 250,000 characters is roughly 183KB of JPEG. That
 * sits comfortably inside Firestore's 1MB document ceiling alongside every
 * other field, and leaves the rules' 350,000-character guard real headroom
 * rather than the ~9,000 characters a "250KB of binary" reading would have
 * left. See CONTEXT.md § Photos live in the document.
 */
export const PHOTO_MAX_CHARS = 250000;

/** Shape of a `groups/{groupId}/cars/{carId}` document. */
export interface CarDoc {
    brand: string;
    model: string;
    year: number;
    nickname?: string;
    plate?: string;
    odometer?: number;
    odometerReading?: { value: number; at: Timestamp | FieldValue };
    /**
     * Owner-supplied photo as a JPEG data URL. [C5, D4]
     *
     * In the document rather than Firebase Storage, which requires the Blaze
     * plan for new projects and so breaks the zero-cost constraint. There is
     * deliberately no `imageUrl` companion — the CarImages API that would have
     * filled it is defunct and its successor is paid. See CONTEXT.md § the
     * CarImages gate.
     */
    photo?: string;
    /**
     * When the odometer was last corrected downwards. [C9]
     *
     * The audit half of the monotonic guard: a decrease is only permitted when
     * the same write records that it was a deliberate correction, so "it went
     * down" is never something that can just quietly happen.
     */
    odometerCorrectedAt?: Timestamp | FieldValue;
    access: CarAccess;
    /** [T12] */
    lastByType: Record<string, LastServiceEntry>;
    /** [T13] */
    statusStamp: CarStatusStamp;
    /** [T12] Running total in RM, delta-updated by log writes. */
    totalSpend: number;
    /**
     * Spend per service type in RM, delta-updated by every log write. [SPD1, T20]
     *
     * Keyed by the log's `type` id (a preset from maintenance-types.json, or
     * `custom`). This is what the car page's by-type donut reads from — a
     * denormalised total rather than a sum over history, which is what makes
     * the chart cost zero extra Firestore reads.
     *
     * Optional: absent means empty. Cars written before T17 have no such
     * field, and Recalculate is the backfill (T20 extends it).
     */
    spendByType?: Record<string, number>;
    /** The uid that added the car. Holds edit implicitly. [C6] */
    createdBy: string;
    createdAt: Timestamp | FieldValue;
}

/** A car document paired with its id, as the UI consumes it. */
export interface Car extends Omit<CarDoc, "createdAt" | "odometerCorrectedAt" | "odometerReading"> {
    odometerRecordedAt?: Timestamp | null;
    id: string;
    createdAt: Timestamp | null;
    odometerCorrectedAt: Timestamp | null;
}

/**
 * Narrows to a real Timestamp.
 *
 * `createdAt` is a serverTimestamp() sentinel on the way out and a Timestamp on
 * the way back — but a snapshot with pending local writes briefly reports null,
 * and a hand-authored document may hold anything at all. Everything downstream
 * (sorting, formatting) wants a Timestamp or nothing, so the conversion happens
 * once, here.
 */
const asTimestamp = (value: unknown): Timestamp | null =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as Timestamp).toMillis === "function"
        ? (value as Timestamp)
        : null;

/**
 * Reads a car snapshot defensively, the way `toGroup` does. A document written
 * by an older build (or by hand in the console) can be missing keys, and a
 * list of cars must render them rather than crash.
 */
export const toCar = (id: string, data: Partial<CarDoc>): Car => ({
    id,
    brand: data.brand?.trim() ?? "",
    model: data.model?.trim() ?? "",
    year: typeof data.year === "number" ? data.year : 0,
    nickname: data.nickname?.trim() || undefined,
    plate: data.plate?.trim() || undefined,
    odometer: typeof data.odometer === "number" ? data.odometer : undefined,
    odometerRecordedAt: data.odometerReading && data.odometerReading.value === data.odometer
        ? asTimestamp(data.odometerReading.at)
        : null,
    photo: typeof data.photo === "string" && data.photo ? data.photo : undefined,
    odometerCorrectedAt: asTimestamp(data.odometerCorrectedAt),
    access: data.access ?? {},
    lastByType: data.lastByType ?? {},
    statusStamp: data.statusStamp ?? {},
    totalSpend: typeof data.totalSpend === "number" ? data.totalSpend : 0,
    spendByType: data.spendByType ?? {},
    createdBy: data.createdBy ?? "",
    createdAt: asTimestamp(data.createdAt),
});

/**
 * What to call this car. The nickname is the whole point of C3 — "Mum's Myvi"
 * is how a family actually refers to it — so it wins outright when present.
 */
export const carDisplayName = (car: Car): string => {
    if (car.nickname) return car.nickname;

    const made = `${car.brand} ${car.model}`.trim();
    return made || "Untitled car";
};

/**
 * "Perodua Myvi · 2018" — the secondary line under the display name.
 *
 * The "brand model" half is dropped when it would just restate the name
 * above it — a family that calls the Persona "Persona" shouldn't read a
 * card that says "Persona / Proton Persona · 2021". The distinct-nickname
 * case is unchanged.
 */
export const carSubtitle = (car: Car): string => {
    const made = `${car.brand} ${car.model}`.trim();
    const displayName = carDisplayName(car);
    const showMade =
        !!car.nickname &&
        made.length > 0 &&
        displayName !== car.model &&
        displayName !== made;
    return [showMade ? made : "", car.year || ""]
        .filter(Boolean)
        .join(" · ");
};

/**
 * Whether `uid` may edit this car and its logs. [C6, C8]
 *
 * Three ways in, and the two implicit ones are why this is a function rather
 * than a lookup in `access`: the creator keeps edit on what they added, and the
 * group's owner has it over everything in their group.
 *
 * Mirrored by `carEdit()` in firestore.rules — the UI hides what this returns
 * false for, the rules refuse it. Keep the two in step.
 */
export const hasCarEdit = (
    car: Car,
    uid: string | undefined,
    groupOwnerId: string,
): boolean => {
    if (!uid) return false;
    return (
        uid === groupOwnerId ||
        uid === car.createdBy ||
        car.access[uid] === "edit"
    );
};

/**
 * Whether `uid`'s edit on this car is IMPLICIT — held by being the group's
 * owner or the car's creator. [C6, C7]
 *
 * The access grid needs this separately from `hasCarEdit`: an implicit holder's
 * cell is shown on and locked, because there is no entry to remove and C6 says
 * the right can't be revoked. A toggle that appeared to turn it off would be
 * offering a lie.
 */
export const hasImplicitCarEdit = (
    car: Car,
    uid: string,
    groupOwnerId: string,
): boolean => uid === groupOwnerId || uid === car.createdBy;

/**
 * The access map with one member toggled, ready to write. [C7]
 *
 * Implicit holders are never written in — see the note on `CarAccess`. Asking
 * to grant one is a no-op rather than an error, because the UI should never be
 * able to ask in the first place and the rules refuse it if it does.
 */
export const withCarAccess = (
    car: Car,
    uid: string,
    allowed: boolean,
    groupOwnerId: string,
): CarAccess => {
    const next: CarAccess = { ...car.access };
    delete next[uid];

    if (allowed && !hasImplicitCarEdit(car, uid, groupOwnerId)) {
        next[uid] = "edit";
    }
    return next;
};

/**
 * Cars in a stable, human order: newest first, then by name.
 *
 * Sorted client-side rather than by an `orderBy` on the query, because a car
 * whose `createdAt` is still a pending server timestamp reads back as null —
 * it would sort to the bottom on the server and then jump when the write
 * settles. Name is the tiebreak, so the order is total and never flickers.
 */
export const sortCars = (cars: Car[]): Car[] =>
    [...cars].sort((a, b) => {
        const aTime = a.createdAt?.toMillis() ?? 0;
        const bTime = b.createdAt?.toMillis() ?? 0;
        if (aTime !== bTime) return bTime - aTime;
        return carDisplayName(a).localeCompare(carDisplayName(b));
    });

/** "128,400 km" */
export const formatOdometer = (km: number | undefined): string =>
    typeof km === "number" ? `${km.toLocaleString()} km` : "";

/**
 * What to show in a car's image slot. [C5]
 *
 * `photo ?? placeholder`. There is no `imageUrl` rung between them: the API
 * that would have supplied it is gone and its successor is paid, so the
 * precedence plan.md described has one fewer step than planned. See CONTEXT.md
 * § the CarImages gate.
 */
export const carPhoto = (car: Car): string | null => car.photo ?? null;

/**
 * True when this odometer reading would go backwards. [C9]
 *
 * A car with no reading yet can be given any value — there is nothing to go
 * backwards from.
 */
export const isOdometerDecrease = (car: Car, next: number): boolean =>
    typeof car.odometer === "number" && next < car.odometer;
