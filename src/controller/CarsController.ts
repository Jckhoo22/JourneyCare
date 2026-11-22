import { useCallback, useEffect, useState } from "react";
import {
    collection,
    deleteField,
    doc,
    getDocs,
    increment,
    limit,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    writeBatch,
} from "firebase/firestore";

import { db } from "../configurations/firebase-config";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/Toast";
import { useUser } from "../context/UserContext";
import {
    isValidCarText,
    isValidCarYear,
    isValidOdometer,
    CAR_PLATE_MAX_LENGTH,
    CAR_TEXT_MAX_LENGTH,
} from "../constants/regex";
import {
    carDisplayName,
    hasCarEdit,
    hasImplicitCarEdit,
    isOdometerDecrease,
    sortCars,
    toCar,
    withCarAccess,
    type Car,
    type CarDoc,
} from "../model/Car";
import type { Group } from "../model/Group";
import { accessChangedNotification } from "../model/Notification";
import {
    getErrorCode,
    getFirebaseErrorMessage,
} from "../utils/firebaseErrorMapper";

/**
 * Ceiling on the cars listener.
 *
 * A family group holds a handful of cars, so this is unreachable in practice —
 * it exists because an unbounded listener is the read-amplification trap the
 * project has already been bitten by once. It warns rather than truncating in
 * silence: a group that somehow passes 50 cars should be a visible problem,
 * not a list that quietly stops.
 */
const CARS_LIMIT = 50;

interface CarsSnapshot {
    groupId: string;
    cars: Car[];
    error: string | null;
}

/** Live list of a group's cars. [C10] */
export const useCars = (
    groupId: string | undefined,
): { cars: Car[]; isLoading: boolean; error: string | null } => {
    const [snapshot, setSnapshot] = useState<CarsSnapshot | null>(null);

    useEffect(() => {
        if (!groupId) return;

        const carsQuery = query(
            collection(db, "groups", groupId, "cars"),
            limit(CARS_LIMIT),
        );

        const unsubscribe = onSnapshot(
            carsQuery,
            (result) => {
                if (result.docs.length >= CARS_LIMIT) {
                    console.warn(
                        `Group ${groupId} has hit the ${CARS_LIMIT}-car listener cap; ` +
                            "the list is truncated. Raise CARS_LIMIT or paginate.",
                    );
                }
                setSnapshot({
                    groupId,
                    cars: sortCars(
                        result.docs.map((entry) =>
                            toCar(entry.id, entry.data() as Partial<CarDoc>),
                        ),
                    ),
                    error: null,
                });
            },
            (snapshotError) => {
                console.error("Cars listener error:", snapshotError);
                setSnapshot({
                    groupId,
                    cars: [],
                    error: getFirebaseErrorMessage(getErrorCode(snapshotError)),
                });
            },
        );

        return () => unsubscribe();
    }, [groupId]);

    // A snapshot belonging to a previous group is stale — treat it as still
    // loading rather than briefly showing another group's cars.
    const isCurrent = snapshot !== null && snapshot.groupId === groupId;

    return {
        cars: isCurrent ? snapshot.cars : [],
        isLoading: !isCurrent,
        error: isCurrent ? snapshot.error : null,
    };
};

/** What the add-car form collects. Everything but brand/model/year is optional. [C3] */
export interface CarDraft {
    brand: string;
    model: string;
    year: number;
    nickname: string;
    plate: string;
    /** Raw text — the form keeps it a string so an empty field stays empty. */
    odometer: string;
}

export interface CarFieldErrors {
    brand: string;
    model: string;
    year: string;
    nickname: string;
    plate: string;
    odometer: string;
}

const NO_ERRORS: CarFieldErrors = {
    brand: "",
    model: "",
    year: "",
    nickname: "",
    plate: "",
    odometer: "",
};

interface UseCarActionsResult {
    /** Resolves to the new car's id, or null if it didn't happen. */
    createCar: (draft: CarDraft) => Promise<string | null>;
    isSaving: boolean;
    errors: CarFieldErrors;
    clearError: (field: keyof CarFieldErrors) => void;
}

/** Adding a car. [C1–C3, P3a] */
export const useCarActions = (
    groupId: string | undefined,
): UseCarActionsResult => {
    const { user } = useUser();
    const { addToast } = useToast();
    const { locale } = useLanguage();

    const uid = user?.uid;

    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<CarFieldErrors>(NO_ERRORS);

    const clearError = useCallback((field: keyof CarFieldErrors) => {
        setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
    }, []);

    const createCar = useCallback(
        async (draft: CarDraft): Promise<string | null> => {
            if (!groupId || !uid) return null;

            const brand = draft.brand.trim();
            const model = draft.model.trim();
            const nickname = draft.nickname.trim();
            const plate = draft.plate.trim().toUpperCase();
            const rawOdometer = draft.odometer.trim();

            // Validate everything before touching the network, so the form can
            // show every problem at once rather than one per round trip.
            const next = { ...NO_ERRORS };

            if (!brand) next.brand = locale.errors.required;
            else if (!isValidCarText(brand)) next.brand = locale.errors.carTextTooLong;

            if (!model) next.model = locale.errors.required;
            else if (!isValidCarText(model)) next.model = locale.errors.carTextTooLong;

            if (!isValidCarYear(draft.year)) next.year = locale.errors.required;

            if (nickname && nickname.length > CAR_TEXT_MAX_LENGTH) {
                next.nickname = locale.errors.carTextTooLong;
            }
            if (plate && plate.length > CAR_PLATE_MAX_LENGTH) {
                next.plate = locale.errors.plateTooLong;
            }

            // Empty is fine — plenty of people won't know it offhand. [C3]
            let odometer: number | undefined;
            if (rawOdometer) {
                const parsed = Number(rawOdometer.replace(/[\s,]/g, ""));
                if (!isValidOdometer(parsed)) {
                    next.odometer = locale.errors.odometerInvalid;
                } else {
                    odometer = parsed;
                }
            }

            setErrors(next);
            if (Object.values(next).some(Boolean)) return null;

            setIsSaving(true);
            try {
                // Auto-id up front so the car and the group's counter can go in
                // one batch. [P3a]
                const carRef = doc(collection(db, "groups", groupId, "cars"));
                const batch = writeBatch(db);

                // This shape is pinned by the create rule: no access granted,
                // no history, createdBy is the caller.
                const payload: CarDoc = {
                    brand,
                    model,
                    year: draft.year,
                    ...(nickname ? { nickname } : {}),
                    ...(plate ? { plate } : {}),
                    ...(odometer !== undefined ? {
                        odometer,
                        odometerReading: { value: odometer, at: serverTimestamp() },
                    } : {}),
                    access: {},
                    lastByType: {},
                    statusStamp: {},
                    totalSpend: 0,
                    createdBy: uid,
                    createdAt: serverTimestamp(),
                };
                batch.set(carRef, payload);

                // Same batch, so the counter can't drift from the cars that
                // actually exist. [P3a]
                batch.update(doc(db, "groups", groupId), {
                    carCount: increment(1),
                });

                await batch.commit();

                addToast(
                    locale.cars.added.replace("{name}", nickname || `${brand} ${model}`),
                    "success",
                );
                return carRef.id;
            } catch (error: unknown) {
                console.error("Create car error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return null;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, groupId, locale, uid],
    );

    return { createCar, isSaving, errors, clearError };
};

interface CarSnapshot {
    key: string;
    car: Car | null;
}

/**
 * Live view of one car. [C10]
 *
 * A denied read and a missing car collapse to the same `notFound`, exactly as
 * `useGroup` does — telling someone "this exists but you can't see it" leaks
 * the car's existence to a non-member.
 */
export const useCar = (
    groupId: string | undefined,
    carId: string | undefined,
): { car: Car | null; isLoading: boolean; notFound: boolean } => {
    const [snapshot, setSnapshot] = useState<CarSnapshot | null>(null);
    const key = `${groupId ?? ""}/${carId ?? ""}`;

    useEffect(() => {
        if (!groupId || !carId) return;

        const unsubscribe = onSnapshot(
            doc(db, "groups", groupId, "cars", carId),
            (result) => {
                setSnapshot({
                    key,
                    car: result.exists()
                        ? toCar(result.id, result.data() as Partial<CarDoc>)
                        : null,
                });
            },
            (error) => {
                console.error("Car listener error:", error);
                setSnapshot({ key, car: null });
            },
        );

        return () => unsubscribe();
    }, [carId, groupId, key]);

    const isCurrent = snapshot !== null && snapshot.key === key;

    return {
        car: isCurrent ? snapshot.car : null,
        isLoading: !isCurrent,
        notFound: isCurrent && snapshot.car === null,
    };
};

/** What an odometer update did, or refused to do. [C9] */
export type OdometerOutcome =
    | "saved"
    /** Unchanged — nothing was written. */
    | "unchanged"
    /** The value would go backwards; the caller must confirm it's a correction. */
    | "needs-confirmation"
    | "invalid"
    | "failed";

/** Firestore's hard cap is 500 writes per batch; stay clear of it. */
const MAX_BATCH = 400;

interface UseCarEditActionsResult {
    /** Brand, model, year, nickname, plate. Odometer has its own path. [C8] */
    saveDetails: (car: Car, draft: CarDetailsDraft) => Promise<boolean>;
    /** [C9] */
    saveOdometer: (
        car: Car,
        raw: string,
        options?: { confirmCorrection?: boolean },
    ) => Promise<OdometerOutcome>;
    /** A compressed data URL, or null to remove the photo. [C5] */
    savePhoto: (car: Car, dataUrl: string | null) => Promise<boolean>;
    /** Owner or creator only. Takes the car's logs with it. [C8] */
    deleteCar: (car: Car) => Promise<boolean>;
    isSaving: boolean;
    errors: CarFieldErrors;
    clearError: (field: keyof CarFieldErrors) => void;
}

/** The subset of a car the edit form owns. Odometer is deliberately absent. */
export interface CarDetailsDraft {
    brand: string;
    model: string;
    year: number;
    nickname: string;
    plate: string;
}

/** Editing, photographing and deleting a car. [C5, C8, C9] */
export const useCarEditActions = (
    groupId: string | undefined,
): UseCarEditActionsResult => {
    const { addToast } = useToast();
    const { locale } = useLanguage();

    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<CarFieldErrors>(NO_ERRORS);

    const clearError = useCallback((field: keyof CarFieldErrors) => {
        setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
    }, []);

    const carRef = useCallback(
        (carId: string) => doc(db, "groups", groupId!, "cars", carId),
        [groupId],
    );

    // ── Details ────────────────────────────────────────────────────────────
    const saveDetails = useCallback(
        async (car: Car, draft: CarDetailsDraft): Promise<boolean> => {
            if (!groupId) return false;

            const brand = draft.brand.trim();
            const model = draft.model.trim();
            const nickname = draft.nickname.trim();
            const plate = draft.plate.trim().toUpperCase();

            const next = { ...NO_ERRORS };
            if (!brand) next.brand = locale.errors.required;
            else if (!isValidCarText(brand)) next.brand = locale.errors.carTextTooLong;
            if (!model) next.model = locale.errors.required;
            else if (!isValidCarText(model)) next.model = locale.errors.carTextTooLong;
            if (!isValidCarYear(draft.year)) next.year = locale.errors.required;
            if (nickname && nickname.length > CAR_TEXT_MAX_LENGTH) {
                next.nickname = locale.errors.carTextTooLong;
            }
            if (plate && plate.length > CAR_PLATE_MAX_LENGTH) {
                next.plate = locale.errors.plateTooLong;
            }

            setErrors(next);
            if (Object.values(next).some(Boolean)) return false;

            setIsSaving(true);
            try {
                // deleteField() rather than an empty string: a cleared nickname
                // should leave the document, so `photo ?? placeholder`-style
                // fallbacks see absence rather than "".
                await updateDoc(carRef(car.id), {
                    brand,
                    model,
                    year: draft.year,
                    nickname: nickname || deleteField(),
                    plate: plate || deleteField(),
                });

                addToast(locale.cars.detailsSaved, "success");
                return true;
            } catch (error: unknown) {
                console.error("Save car details error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, carRef, groupId, locale],
    );

    // ── Odometer [C9] ──────────────────────────────────────────────────────
    const saveOdometer = useCallback(
        async (
            car: Car,
            raw: string,
            options?: { confirmCorrection?: boolean },
        ): Promise<OdometerOutcome> => {
            if (!groupId) return "failed";

            const parsed = Number(raw.trim().replace(/[\s,]/g, ""));
            if (!raw.trim() || !isValidOdometer(parsed)) {
                setErrors((prev) => ({
                    ...prev,
                    odometer: locale.errors.odometerInvalid,
                }));
                return "invalid";
            }
            if (parsed === car.odometer) return "unchanged";

            // An odometer doesn't run backwards, so going down is either a
            // typo or a correction — and the caller has to say which before
            // anything is written. The rules refuse an unstamped decrease
            // regardless; this is what makes the refusal a question rather
            // than an error. [C9]
            const isCorrection = isOdometerDecrease(car, parsed);
            if (isCorrection && !options?.confirmCorrection) {
                return "needs-confirmation";
            }
            if (typeof navigator !== "undefined" && navigator.onLine === false) {
                setErrors((prev) => ({ ...prev, odometer: locale.common.connectionRequired }));
                return "failed";
            }

            setIsSaving(true);
            try {
                await updateDoc(carRef(car.id), {
                    odometer: parsed,
                    odometerReading: { value: parsed, at: serverTimestamp() },
                    // Stamped only on a decrease — the rules reject it on an
                    // increase, so the field always means what it says.
                    ...(isCorrection
                        ? { odometerCorrectedAt: serverTimestamp() }
                        : {}),
                });

                addToast(locale.cars.odometerSaved, "success");
                return "saved";
            } catch (error: unknown) {
                console.error("Save odometer error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return "failed";
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, carRef, groupId, locale],
    );

    // ── Photo [C5, D4] ─────────────────────────────────────────────────────
    const savePhoto = useCallback(
        async (car: Car, dataUrl: string | null): Promise<boolean> => {
            if (!groupId) return false;

            setIsSaving(true);
            try {
                await updateDoc(carRef(car.id), {
                    photo: dataUrl ?? deleteField(),
                });

                addToast(
                    dataUrl ? locale.cars.photoSaved : locale.cars.photoRemoved,
                    "success",
                );
                return true;
            } catch (error: unknown) {
                console.error("Save photo error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, carRef, groupId, locale],
    );

    // ── Delete [C8] ────────────────────────────────────────────────────────
    /**
     * Deletes the car, its logs, and the group's counter.
     *
     * Firestore never cascades, so the logs have to go explicitly — otherwise
     * they'd sit unreachable under a car that no longer exists, counting
     * against storage forever.
     *
     * Order matters: logs first, then the car and the counter together. If the
     * run dies halfway, what survives is a car with fewer logs — visible,
     * and fixed by deleting it again. The reverse order would leave orphans
     * nothing can reach.
     */
    const deleteCar = useCallback(
        async (car: Car): Promise<boolean> => {
            if (!groupId) return false;

            setIsSaving(true);
            try {
                const logs = await getDocs(
                    collection(db, "groups", groupId, "cars", car.id, "logs"),
                );

                for (let from = 0; from < logs.docs.length; from += MAX_BATCH) {
                    const chunk = logs.docs.slice(from, from + MAX_BATCH);
                    const logBatch = writeBatch(db);
                    chunk.forEach((entry) => logBatch.delete(entry.ref));
                    await logBatch.commit();
                }

                // Parts subcollection [T18]. Same cascade discipline as logs:
                // deepest-first, chunked, before the car itself — the parts
                // read rule requires the parent car to exist. Firestore never
                // cascades and a car photo alone can be 250,000 characters,
                // so orphaned parts would be unreadable and undeletable
                // afterwards, exactly like logs would be.
                const parts = await getDocs(
                    collection(db, "groups", groupId, "cars", car.id, "parts"),
                );
                for (let from = 0; from < parts.docs.length; from += MAX_BATCH) {
                    const chunk = parts.docs.slice(from, from + MAX_BATCH);
                    const partBatch = writeBatch(db);
                    chunk.forEach((entry) => partBatch.delete(entry.ref));
                    await partBatch.commit();
                }

                const batch = writeBatch(db);
                batch.delete(carRef(car.id));
                // Same batch as the car, so the counter can't drift. [P3a]
                batch.update(doc(db, "groups", groupId), {
                    carCount: increment(-1),
                });
                await batch.commit();

                addToast(locale.cars.deleted, "info");
                return true;
            } catch (error: unknown) {
                console.error("Delete car error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, carRef, groupId, locale],
    );

    return {
        saveDetails,
        saveOdometer,
        savePhoto,
        deleteCar,
        isSaving,
        errors,
        clearError,
    };
};

/**
 * Granting and revoking per-car edit. [C6, C7, N6]
 *
 * One batch: the car's access map, and a notification to the member it
 * concerns. Batched so a member is never silently granted or quietly stripped
 * — the same reasoning as the join decisions and the group rename.
 *
 * `busyKey` is per CELL (`carId:uid`) rather than a single flag, because the
 * grid shows many toggles at once and freezing all of them because one is
 * saving would make the panel feel broken.
 *
 * ── Toasting is the caller's job ────────────────────────────────────────────
 * Neither `setCarEdit` nor `setCarEditBulk` fires a toast. The PeoplePanel
 * cells are wrapped in `useDebouncedToggle`, which collapses a rapid flip
 * on-off-on into ONE settled write — a toast fired inside the controller
 * would run for every intermediate flip, not for the settled one. The
 * wrapper toasts against the settled call using a `kind` so a burst never
 * stacks in the corner.
 */
export const useCarAccessActions = (
    groupId: string | undefined,
): {
    setCarEdit: (
        group: Group,
        car: Car,
        uid: string,
        allowed: boolean,
    ) => Promise<boolean>;
    setCarEditBulk: (
        group: Group,
        cars: Car[],
        uid: string,
        allowed: boolean,
    ) => Promise<boolean>;
    busyKey: string | null;
    bulkBusyUid: string | null;
} => {
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [bulkBusyUid, setBulkBusyUid] = useState<string | null>(null);

    const setCarEdit = useCallback(
        async (
            group: Group,
            car: Car,
            uid: string,
            allowed: boolean,
        ): Promise<boolean> => {
            if (!groupId) return false;
            // The owner's and creator's edit is implicit and can't be revoked,
            // so there is nothing here to write. The UI locks these cells; this
            // is the belt to that pair of braces. [C6]
            if (hasImplicitCarEdit(car, uid, group.ownerId)) return false;

            setBusyKey(`${car.id}:${uid}`);
            try {
                const carName = carDisplayName(car);
                const batch = writeBatch(db);

                // Only `access` — the rules reject a diff touching anything
                // else, which is what stops a grant carrying a silent edit.
                batch.update(doc(db, "groups", groupId, "cars", car.id), {
                    access: withCarAccess(car, uid, allowed, group.ownerId),
                });

                // Same batch. [N6]
                batch.set(
                    doc(collection(db, "notifications", uid, "items")),
                    accessChangedNotification(
                        group.id,
                        group.name,
                        car.id,
                        carName,
                        allowed,
                    ),
                );

                await batch.commit();
                return true;
            } catch (error: unknown) {
                console.error("Car access toggle failed:", error);
                return false;
            } finally {
                setBusyKey(null);
            }
        },
        [groupId],
    );

    /**
     * Bulk grant or revoke edit on EVERY car in the group for ONE member. [C6, C7]
     *
     * A UI convenience: exactly N calls to setCarEdit collapsed into one
     * commit. Each write in the batch has the exact same shape as the
     * single-car path — one `access` update on the car, one
     * `accessChangedNotification` to the member — so the rules admit every
     * write via isAccessUpdate + isAccessChangedNotice independently, the
     * same branches the per-cell switch already rides.
     *
     * Skips two kinds of car:
     *   • implicit holders (owner / creator) — nothing to write, and the UI
     *     locks those cells.
     *   • cars already at the target flag — writing an unchanged flag would
     *     land as a stray "you gained/lost edit" notification for something
     *     that did not move.
     *
     * Not stored anywhere. This acts on the group's CURRENT cars; a member's
     * standing right on future cars is a separate concept and is not persisted
     * by this call.
     *
     * The whole action is one commit: it lands as a unit or fails as a unit,
     * never as half-flipped rows. Well within Firestore's 500-op batch limit —
     * CARS_LIMIT is 50, so the worst case is 100 writes.
     */
    const setCarEditBulk = useCallback(
        async (
            group: Group,
            cars: Car[],
            uid: string,
            allowed: boolean,
        ): Promise<boolean> => {
            if (!groupId) return false;
            // Owner holds implicit edit on every car; the bulk toggle should
            // not render for them. Belt to that pair of braces.
            if (uid === group.ownerId) return false;

            const changes = cars.filter(
                (car) =>
                    !hasImplicitCarEdit(car, uid, group.ownerId) &&
                    hasCarEdit(car, uid, group.ownerId) !== allowed,
            );
            if (changes.length === 0) return true;

            setBulkBusyUid(uid);
            try {
                const batch = writeBatch(db);
                for (const car of changes) {
                    batch.update(doc(db, "groups", groupId, "cars", car.id), {
                        access: withCarAccess(car, uid, allowed, group.ownerId),
                    });
                    batch.set(
                        doc(collection(db, "notifications", uid, "items")),
                        accessChangedNotification(
                            group.id,
                            group.name,
                            car.id,
                            carDisplayName(car),
                            allowed,
                        ),
                    );
                }

                await batch.commit();
                return true;
            } catch (error: unknown) {
                console.error("Bulk car access toggle failed:", error);
                return false;
            } finally {
                setBulkBusyUid(null);
            }
        },
        [groupId],
    );

    return { setCarEdit, setCarEditBulk, busyKey, bulkBusyUid };
};
