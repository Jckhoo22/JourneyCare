import { useCallback, useEffect, useState } from "react";
import {
    Timestamp,
    collection,
    deleteField,
    doc,
    getDocsFromServer,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    startAfter,
    where,
    runTransaction,
} from "firebase/firestore";

import { db } from "../configurations/firebase-config";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/Toast";
import { useUser } from "../context/UserContext";
import { isValidOdometer } from "../constants/regex";
import { toCar, type CarDoc } from "../model/Car";
import {
    parseLocalDate,
    compareServiceOrder,
    serviceReminderKey,
    toLastService,
    toLog,
    type LastServiceSummary,
    type Log,
    type LogDoc,
} from "../model/Log";
import { spendMonthOf, spendYearOf } from "../lib/spend";
import { resolveVisit, type VisitDraft } from "../model/Visit";
import type { PartDoc } from "../model/Part";
import { resolvePartDraft } from "./PartsController";
import { toMoney } from "../utils/money";
import {
    getErrorCode,
    getFirebaseErrorMessage,
} from "../utils/firebaseErrorMapper";

/** One page of history. [L6] */
export const LOGS_PAGE_SIZE = 20;

/**
 * How many entries of one type the recompute reads.
 *
 * Preset recomputation reads past the latest date only far enough to resolve
 * ties. Custom recomputation pages through custom entries to rebuild their
 * separate identities, including entries saved before that split.
 */
const RECOMPUTE_WINDOW = 3;

interface LogsSnapshot {
    key: string;
    logs: Log[];
    error: string | null;
}

/**
 * A car's maintenance history, newest first and explicitly bounded. [L6]
 *
 * `loadMore` raises the ceiling a page at a time rather than listening to
 * everything — the listener always has a limit on it, exactly as the
 * notification list does.
 */
export const useLogs = (
    groupId: string | undefined,
    carId: string | undefined,
): {
    logs: Log[];
    isLoading: boolean;
    hasMore: boolean;
    loadMore: () => void;
    error: string | null;
} => {
    const [pageLimit, setPageLimit] = useState(LOGS_PAGE_SIZE);
    const [snapshot, setSnapshot] = useState<LogsSnapshot | null>(null);
    const key = `${groupId ?? ""}/${carId ?? ""}`;

    useEffect(() => {
        if (!groupId || !carId) return;

        const listQuery = query(
            collection(db, "groups", groupId, "cars", carId, "logs"),
            orderBy("date", "desc"),
            limit(pageLimit),
        );

        const unsubscribe = onSnapshot(
            listQuery,
            (result) => {
                setSnapshot({
                    key,
                    logs: result.docs.map((entry) =>
                        toLog(entry.id, entry.data() as Partial<LogDoc>),
                    ),
                    error: null,
                });
            },
            (error) => {
                console.error("Logs listener error:", error);
                setSnapshot({
                    key,
                    logs: [],
                    error: getFirebaseErrorMessage(getErrorCode(error)),
                });
            },
        );

        return () => unsubscribe();
    }, [carId, groupId, key, pageLimit]);

    const isCurrent = snapshot !== null && snapshot.key === key;
    const logs = isCurrent ? snapshot.logs : [];

    return {
        logs,
        isLoading: !isCurrent,
        // A full page probably means there's more behind it.
        hasMore: logs.length >= pageLimit,
        loadMore: () => setPageLimit((current) => current + LOGS_PAGE_SIZE),
        error: isCurrent ? snapshot.error : null,
    };
};

export const useServiceLog = (groupId?: string, carId?: string, logId?: string) => {
    const path = groupId && carId && logId ? `groups/${groupId}/cars/${carId}/logs/${logId}` : null;
    const [snapshot, setSnapshot] = useState<{ path: string; log: Log | null } | null>(null);

    useEffect(() => {
        if (!path || !logId) return;
        return onSnapshot(
            doc(db, path),
            (entry) => setSnapshot({
                path,
                log: entry.exists() ? toLog(logId, entry.data() as Partial<LogDoc>) : null,
            }),
            () => setSnapshot({ path, log: null }),
        );
    }, [logId, path]);

    return {
        log: snapshot?.path === path ? snapshot.log : null,
        isLoading: path !== null && snapshot?.path !== path,
    };
};

/** What the add/edit form collects. Strings — the form owns raw input. [L2] */
export interface LogDraft {
    type: string;
    customLabel: string;
    cost: string;
    /** `YYYY-MM-DD`, parsed as LOCAL midnight. */
    date: string;
    odometer: string;
    intervalKm: string;
    intervalMonths: string;
    notes: string;
    /** Also move the car's current reading up to this one. [1's checkbox] */
    updateCarOdometer: boolean;
}

export interface LogFieldErrors {
    type: string;
    customLabel: string;
    cost: string;
    date: string;
    odometer: string;
    intervalKm: string;
    intervalMonths: string;
}

const NO_ERRORS: LogFieldErrors = {
    type: "",
    customLabel: "",
    cost: "",
    date: "",
    odometer: "",
    intervalKm: "",
    intervalMonths: "",
};

const parseOptionalInt = (raw: string): number | undefined | null => {
    const trimmed = raw.trim().replace(/[\s,]/g, "");
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/** A validated draft, ready to write. */
interface ResolvedDraft {
    type: string;
    customLabel?: string;
    cost: number;
    date: Date;
    odometer?: number;
    intervalKm?: number;
    intervalMonths?: number;
    notes?: string;
}

/**
 * Everything the form can get wrong, checked before any network call — so it
 * shows every problem at once rather than one per round trip.
 */
const resolveDraft = (
    draft: LogDraft,
    locale: ReturnType<typeof useLanguage>["locale"],
): { resolved: ResolvedDraft | null; errors: LogFieldErrors } => {
    const errors = { ...NO_ERRORS };

    const type = draft.type.trim();
    if (!type) errors.type = locale.errors.required;

    const customLabel = draft.customLabel.trim();
    if (type === "custom" && !customLabel) {
        errors.customLabel = locale.errors.required;
    }

    const rawCost = draft.cost.trim().replace(/[\s,]/g, "");
    const cost = Number(rawCost);
    if (!rawCost) errors.cost = locale.errors.required;
    else if (!Number.isFinite(cost) || cost < 0) errors.cost = locale.errors.costInvalid;

    const date = parseLocalDate(draft.date);
    if (!date) errors.date = locale.errors.required;
    // Local midnight today is always already past, so "today" is fine.
    else if (date.getTime() > Date.now()) errors.date = locale.errors.dateFuture;

    let odometer: number | undefined;
    const rawOdometer = draft.odometer.trim().replace(/[\s,]/g, "");
    if (rawOdometer) {
        const parsed = Number(rawOdometer);
        if (!isValidOdometer(parsed)) errors.odometer = locale.errors.odometerInvalid;
        else odometer = parsed;
    }

    const intervalKm = parseOptionalInt(draft.intervalKm);
    if (intervalKm === null) errors.intervalKm = locale.errors.intervalInvalid;
    const intervalMonths = parseOptionalInt(draft.intervalMonths);
    if (intervalMonths === null) errors.intervalMonths = locale.errors.intervalInvalid;

    if (Object.values(errors).some(Boolean) || !date) {
        return { resolved: null, errors };
    }

    return {
        errors,
        resolved: {
            type,
            ...(type === "custom" ? { customLabel } : {}),
            cost: toMoney(cost),
            date,
            ...(odometer !== undefined ? { odometer } : {}),
            ...(intervalKm ? { intervalKm } : {}),
            ...(intervalMonths ? { intervalMonths } : {}),
            ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        },
    };
};

const recomputeReminders = async (
    groupId: string,
    carId: string,
    type: string,
    exclude?: string,
    candidate?: Log,
    removedKey = type,
): Promise<Record<string, unknown>> => {
    const custom = type === "custom";
    const pageSize = custom ? LOGS_PAGE_SIZE : RECOMPUTE_WINDOW;
    const logsQuery = query(
        collection(db, "groups", groupId, "cars", carId, "logs"),
        where("type", "==", type),
        orderBy("date", "desc"),
        limit(pageSize),
    );
    const winners = new Map<string, Log>();
    const consider = (log: Log) => {
        const key = serviceReminderKey(log);
        const winner = winners.get(key);
        if (log.date && (!winner || compareServiceOrder(log, winner) > 0)) {
            winners.set(key, log);
        }
    };
    if (candidate) consider(candidate);

    let page = await getDocsFromServer(logsQuery);
    while (page.docs.length > 0) {
        let lastDate: Timestamp | null = null;
        for (const entry of page.docs) {
            const log = toLog(entry.id, entry.data() as Partial<LogDoc>);
            lastDate = log.date;
            if (entry.id !== exclude) consider(log);
        }
        if (page.docs.length < pageSize) break;
        const winnerDate = winners.get(type)?.date;
        if (!custom && winnerDate && lastDate && lastDate.toMillis() < winnerDate.toMillis()) break;
        page = await getDocsFromServer(query(logsQuery, startAfter(page.docs[page.docs.length - 1])));
    }

    // Clear the legacy shared custom slot and any identity removed by an edit.
    const patch: Record<string, unknown> = { [`lastByType.${removedKey}`]: deleteField() };
    if (custom) patch["lastByType.custom"] = deleteField();
    for (const [key, log] of winners) {
        if (log.date) patch[`lastByType.${key}`] = toLastService(log.date, log);
    }
    return patch;
};

interface UseLogActionsResult {
    createLog: (draft: LogDraft) => Promise<boolean>;
    /**
     * The many-items-in-one-batch write. [V1, V2, V4]
     *
     * Every write path in the log space (create, edit, delete, visit) shares
     * the same batch discipline: one log document per item + the car's
     * denorms + the group's denorms, all in one transaction. The rules
     * accept N log docs riding one denorm update because they evaluate each
     * write independently — see the `logs.test.ts` "multi-item visit"
     * assertions. [V5]
     */
    createVisit: (draft: VisitDraft) => Promise<boolean>;
    updateLog: (original: Log, draft: LogDraft) => Promise<boolean>;
    deleteLog: (log: Log) => Promise<boolean>;
    isSaving: boolean;
    errors: LogFieldErrors;
    /** Errors from the last visit save, keyed by item index. */
    visitErrors: LogFieldErrors[];
    clearError: (field: keyof LogFieldErrors) => void;
    clearVisitError: (index: number, field: keyof LogFieldErrors) => void;
}

/**
 * Writing maintenance logs. [L1–L5, S1, S2]
 *
 * Every mutation is ONE batch across three documents:
 *
 *   the log     the entry itself
 *   the car     totalSpend, lastByType[type], and optionally the odometer
 *   the group   spendByYear[year]
 *
 * Committed together because T13 (next-due) and T14 (dashboards) read the denormalised
 * fields and never the history — so a total that disagrees with its logs is a
 * wrong number on someone's home screen, not a slow query. The rules can't
 * verify the linkage (they can't see sibling writes), which is exactly why the
 * client must never split these apart.
 */
export const useLogActions = (
    groupId: string | undefined,
    carId: string | undefined,
): UseLogActionsResult => {
    const { user } = useUser();
    const { addToast } = useToast();
    const { locale } = useLanguage();

    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<LogFieldErrors>(NO_ERRORS);
    const [visitErrors, setVisitErrors] = useState<LogFieldErrors[]>([]);
    const canSaveOnline = useCallback(() => {
        if (typeof navigator === "undefined" || navigator.onLine !== false) return true;
        addToast(locale.common.connectionRequired, "error");
        return false;
    }, [addToast, locale.common.connectionRequired]);

    const clearError = useCallback((field: keyof LogFieldErrors) => {
        setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
    }, []);

    const clearVisitError = useCallback(
        (index: number, field: keyof LogFieldErrors) => {
            setVisitErrors((prev) => {
                const entry = prev[index];
                if (!entry || !entry[field]) return prev;
                const next = [...prev];
                next[index] = { ...entry, [field]: "" };
                return next;
            });
        },
        [],
    );

    const carRef = useCallback(
        () => doc(db, "groups", groupId!, "cars", carId!),
        [carId, groupId],
    );
    const groupRef = useCallback(() => doc(db, "groups", groupId!), [groupId]);

    // ── Create ─────────────────────────────────────────────────────────────
    const createLog = useCallback(
        async (draft: LogDraft): Promise<boolean> => {
            if (!groupId || !carId || !user?.uid) return false;

            const { resolved, errors: found } = resolveDraft(draft, locale);
            setErrors(found);
            if (!resolved || !canSaveOnline()) return false;

            setIsSaving(true);
            try {
                await runTransaction(db, async (batch) => {
                    const currentCar = await batch.get(carRef());
                    if (!currentCar.exists()) throw new Error("Car is unavailable.");
                    const car = toCar(carId, currentCar.data() as Partial<CarDoc>);

                    const stamp = Timestamp.fromDate(resolved.date);

                    const logRef = doc(
                        collection(db, "groups", groupId, "cars", carId, "logs"),
                    );
                    batch.set(logRef, {
                        ...resolved,
                        date: stamp,
                        createdBy: {
                            uid: user.uid,
                            username: user.username || user.nickname || "Someone",
                        },
                        createdAt: serverTimestamp(),
                    } satisfies LogDoc);

                    // lastByType only moves if this entry is the newest of its
                    // type — logging a service you forgot last year must not
                    // overwrite what next-due is counting from. [T13]
                    const key = serviceReminderKey(resolved);
                    const migrated = resolved.type === "custom" && car.lastByType.custom
                        ? await recomputeReminders(groupId, carId, "custom")
                        : {};
                    const field = `lastByType.${key}`;
                    const previous = (migrated[field] as LastServiceSummary | undefined)?.date
                        ?? car.lastByType[key]?.date;
                    const isNewest =
                        !previous || stamp.toMillis() >= previous.toMillis();

                    const carUpdate: Record<string, unknown> = {
                        ...migrated,
                        totalSpend: increment(resolved.cost),
                        // Delta-updated per type so T20's donut can read the
                        // denorm rather than sum history. [SPD1]
                        [`spendByType.${resolved.type}`]: increment(resolved.cost),
                    };
                    if (isNewest) {
                        carUpdate[field] = toLastService(
                            stamp,
                            resolved,
                        );
                    }
                    // People log a service right after it happens, so the reading
                    // taken at the workshop is usually the car's current one. Still
                    // forwards-only — the rules enforce it either way. [C9]
                    if (
                        draft.updateCarOdometer &&
                        resolved.odometer !== undefined &&
                        (car.odometer === undefined || resolved.odometer > car.odometer)
                    ) {
                        carUpdate.odometer = resolved.odometer;
                        carUpdate.odometerReading = { value: resolved.odometer, at: stamp };
                    }
                    batch.update(carRef(), carUpdate);

                    batch.update(groupRef(), {
                        [`spendByYear.${spendYearOf(resolved.date)}`]: increment(
                            resolved.cost,
                        ),
                        // Monthly bucket for the T20 monthly-bar chart. [SPD1]
                        [`spendByMonth.${spendMonthOf(resolved.date)}`]: increment(
                            resolved.cost,
                        ),
                    });
                });
                addToast(locale.logs.added, "success");
                return true;
            } catch (error: unknown) {
                console.error("Create log error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, canSaveOnline, carId, carRef, groupId, groupRef, locale, user],
    );

    // ── Create (many items in one batch) ───────────────────────────────────
    /**
     * A workshop visit. [V1, V2, V4]
     *
     * One shared date + odometer + workshop, N line items, ONE batched write.
     * The batch shape is:
     *
     *   N × log create   under groups/{gid}/cars/{cid}/logs
     *   1 × car update   totalSpend + spendByType + lastByType(s) + optional odometer
     *   1 × group update spendByYear + spendByMonth (one bucket each — the
     *                    whole visit shares a date, so it lands in one)
     *
     * Firestore rules evaluate each write in a batch independently, so the N
     * log creates share one denorm branch on the car (`isLogDenormalisation`)
     * and one on the group (`isSpendUpdate`), each seeing the SUM of the N
     * costs. `logs.test.ts § "multi-item visit"` pins that shape. [V5]
     *
     * Same-type-twice-in-one-visit tiebreak (G-D): items in the array are
     * processed in order, so a later item of the same type wins `lastByType`.
     * The visit shares one date, so date-based tiebreaks would draw — array
     * order is what the user typed on the form, which is the most defensible
     * choice.
     */
    const createVisit = useCallback(
        async (draft: VisitDraft): Promise<boolean> => {
            if (!groupId || !carId || !user?.uid) return false;

            const { logs: itemDrafts, partsToShelve } = resolveVisit(draft);
            if (draft.installingPartId && itemDrafts.length === 0) {
                addToast(locale.logs.visitShelfItemUnavailable, "error");
                return false;
            }
            if (itemDrafts.length === 0 && partsToShelve.length === 0) {
                setErrors({
                    ...NO_ERRORS,
                    type: locale.errors.required,
                });
                return false;
            }

            // Resolve every item; halt on any failure. Errors surface per-item
            // via `visitErrors`, so the form can highlight the offending row.
            const resolvedItems: ResolvedDraft[] = [];
            const perItemErrors: LogFieldErrors[] = [];
            let anyBroken = false;
            for (const { index, draft: item } of itemDrafts) {
                const { resolved, errors: found } = resolveDraft(item, locale);
                perItemErrors[index] = found;
                if (resolved) resolvedItems.push(resolved);
                else anyBroken = true;
            }
            const resolvedParts = partsToShelve.map(({ index, draft: item }) => {
                const { resolved, errors: found } = resolvePartDraft({
                    typeId: item.type,
                    customName: item.customLabel,
                    label: "",
                    notes: item.notes,
                    cost: item.cost,
                    purchaseDate: draft.date,
                }, locale);
                perItemErrors[index] = {
                    ...NO_ERRORS,
                    type: found.typeId,
                    customLabel: found.customName,
                    cost: found.cost,
                    date: found.purchaseDate,
                };
                if (!resolved) anyBroken = true;
                return resolved;
            });
            setVisitErrors(perItemErrors);
            if (anyBroken || !canSaveOnline()) return false;

            setIsSaving(true);
            try {
                const saved = await runTransaction(db, async (batch) => {
                    const currentCar = await batch.get(carRef());
                    if (!currentCar.exists()) throw new Error("Car is unavailable.");
                    const car = toCar(carId, currentCar.data() as Partial<CarDoc>);
                    const partRef = draft.installingPartId && resolvedItems.length > 0
                        ? doc(db, "groups", groupId, "cars", carId, "parts", draft.installingPartId)
                        : null;
                    if (partRef) {
                        const part = await batch.get(partRef);
                        const data = part.data() as PartDoc | undefined;
                        if (!data || data.status !== "on_hand" || data.cost !== resolvedItems[0].cost ||
                            serviceReminderKey({ type: data.typeId, customLabel: data.customName }) !==
                            serviceReminderKey(resolvedItems[0])) {
                            return false;
                        }
                    }
                    // ── The service half (may be empty for shelf-only visits)
                    if (resolvedItems.length > 0) {
                        const totalCost = resolvedItems.reduce(
                            (sum, item) => toMoney(sum + item.cost),
                            0,
                        );

                        // Tiebreak: array order wins. Process left-to-right, later
                        // items overwrite earlier ones of the same type.
                        const lastByTypePatch = car.lastByType.custom && resolvedItems.some((item) => item.type === "custom")
                            ? await recomputeReminders(groupId, carId, "custom")
                            : {};
                        const perTypeSum: Record<string, number> = {};
                        for (const item of resolvedItems) {
                            const stamp = Timestamp.fromDate(item.date);
                            const key = serviceReminderKey(item);
                            const field = `lastByType.${key}`;
                            const previous = (lastByTypePatch[field] as LastServiceSummary | undefined)?.date
                                ?? car.lastByType[key]?.date;
                            const isNewest =
                                !previous || stamp.toMillis() >= previous.toMillis();
                            if (isNewest) {
                                lastByTypePatch[field] =
                                    toLastService(stamp, item);
                            }
                            perTypeSum[item.type] = toMoney(
                                (perTypeSum[item.type] ?? 0) + item.cost,
                            );
                        }

                        // The log id the install-transition (if any) will pin.
                        // Generated up front so the part flip can reference it in
                        // the same batch. Sorted IDs preserve visit row order
                        // when the server assigns every row the same createdAt.
                        const logRefs = resolvedItems.map(() =>
                            doc(collection(db, "groups", groupId, "cars", carId, "logs")),
                        ).sort((a, b) => a.id > b.id ? 1 : a.id < b.id ? -1 : 0);

                        for (let i = 0; i < resolvedItems.length; i += 1) {
                            const item = resolvedItems[i];
                            const stamp = Timestamp.fromDate(item.date);
                            batch.set(logRefs[i], {
                                ...item,
                                date: stamp,
                                createdBy: {
                                    uid: user.uid,
                                    username: user.username || user.nickname || "Someone",
                                },
                                createdAt: serverTimestamp(),
                            } satisfies LogDoc);
                        }

                        const carUpdate: Record<string, unknown> = {
                            totalSpend: increment(totalCost),
                            ...lastByTypePatch,
                        };
                        for (const [type, sum] of Object.entries(perTypeSum)) {
                            carUpdate[`spendByType.${type}`] = increment(sum);
                        }

                        const visitOdo = resolvedItems.find(
                            (item) => item.odometer !== undefined,
                        )?.odometer;
                        if (
                            draft.updateCarOdometer &&
                            visitOdo !== undefined &&
                            (car.odometer === undefined || visitOdo > car.odometer)
                        ) {
                            carUpdate.odometer = visitOdo;
                            carUpdate.odometerReading = {
                                value: visitOdo,
                                at: Timestamp.fromDate(resolvedItems[0].date),
                            };
                        }

                        batch.update(carRef(), carUpdate);

                        const firstDate = resolvedItems[0].date;
                        batch.update(groupRef(), {
                            [`spendByYear.${spendYearOf(firstDate)}`]:
                                increment(totalCost),
                            [`spendByMonth.${spendMonthOf(firstDate)}`]:
                                increment(totalCost),
                        });

                        // Install a shelf part in this same batch. [T18, PRT4]
                        if (partRef) {
                            batch.update(partRef, {
                                status: "installed",
                                installedLogId: logRefs[0].id,
                            });
                        }
                    }

                    // ── The shelf half (PRT5): items the user marked "buy for
                    // later" become on-hand parts. Same batch as the service
                    // half, so the whole visit succeeds or fails atomically.
                    for (const shelfItem of resolvedParts) {
                        if (!shelfItem) continue;
                        const partRef = doc(
                            collection(
                                db,
                                "groups",
                                groupId,
                                "cars",
                                carId,
                                "parts",
                            ),
                        );
                        batch.set(partRef, {
                            ...shelfItem,
                            purchaseDate: Timestamp.fromDate(shelfItem.purchaseDate),
                            status: "on_hand",
                            createdBy: user.uid,
                            createdAt: serverTimestamp(),
                        } satisfies PartDoc);
                    }
                    return true;
                });
                if (!saved) {
                    addToast(locale.logs.visitShelfItemUnavailable, "error");
                    return false;
                }
                addToast(locale.logs.added, "success");
                return true;
            } catch (error: unknown) {
                console.error("Create visit error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, canSaveOnline, carId, carRef, groupId, groupRef, locale, user],
    );

    // ── Edit ───────────────────────────────────────────────────────────────
    const updateLog = useCallback(
        async (entry: Log, draft: LogDraft): Promise<boolean> => {
            if (!groupId || !carId) return false;

            const { resolved, errors: found } = resolveDraft(draft, locale);
            setErrors(found);
            if (!resolved || !canSaveOnline()) return false;

            setIsSaving(true);
            try {
                await runTransaction(db, async (batch) => {
                    const currentCar = await batch.get(carRef());
                    if (!currentCar.exists()) throw new Error("Car is unavailable.");
                    const logRef = doc(db, "groups", groupId, "cars", carId, "logs", entry.id);
                    const snapshot = await batch.get(logRef);
                    if (!snapshot.exists()) throw new Error("This service entry was deleted.");
                    const original = toLog(entry.id, snapshot.data() as Partial<LogDoc>);
                    const stamp = Timestamp.fromDate(resolved.date);
                    const oldDate = original.date?.toDate() ?? resolved.date;
                    const oldYear = spendYearOf(oldDate);
                    const newYear = spendYearOf(resolved.date);
                    const oldMonth = spendMonthOf(oldDate);
                    const newMonth = spendMonthOf(resolved.date);

                    // The affected types: the one it was, and the one it now is.
                    const types = new Set([original.type, resolved.type]);
                    const lastByType: Record<string, unknown> = {};

                    for (const type of types) {
                        const patch = await recomputeReminders(
                            groupId,
                            carId,
                            type,
                            original.id,
                            type === resolved.type
                                ? {
                                      ...original,
                                      ...resolved,
                                      customLabel: resolved.customLabel,
                                      odometer: resolved.odometer,
                                      intervalKm: resolved.intervalKm,
                                      intervalMonths: resolved.intervalMonths,
                                      date: stamp,
                                  }
                                : undefined,
                            type === original.type ? serviceReminderKey(original) : serviceReminderKey(resolved),
                        );
                        Object.assign(lastByType, patch);
                    }

                    batch.update(
                        logRef,
                        {
                            ...resolved,
                            ...(original.customLabel && !resolved.customLabel ? { customLabel: deleteField() } : {}),
                            ...(original.notes && !resolved.notes ? { notes: deleteField() } : {}),
                            ...(original.odometer !== undefined && resolved.odometer === undefined ? { odometer: deleteField() } : {}),
                            ...(original.intervalKm !== undefined && resolved.intervalKm === undefined ? { intervalKm: deleteField() } : {}),
                            ...(original.intervalMonths !== undefined && resolved.intervalMonths === undefined ? { intervalMonths: deleteField() } : {}),
                            date: stamp,
                        },
                    );

                    // spendByType delta. Same idea as the year buckets: same-type
                    // edit is one delta, type-change is subtract-old + add-new.
                    // [SPD1]
                    const carSpendPatch: Record<string, unknown> = {};
                    if (original.type === resolved.type) {
                        carSpendPatch[`spendByType.${resolved.type}`] = increment(
                            toMoney(resolved.cost - original.cost),
                        );
                    } else {
                        carSpendPatch[`spendByType.${original.type}`] = increment(
                            -original.cost,
                        );
                        carSpendPatch[`spendByType.${resolved.type}`] = increment(
                            resolved.cost,
                        );
                    }

                    batch.update(carRef(), {
                        totalSpend: increment(toMoney(resolved.cost - original.cost)),
                        ...lastByType,
                        ...carSpendPatch,
                    });

                    // spendByMonth delta. Same discipline as spendByYear — a
                    // same-month edit is one delta, a date crossing a month
                    // boundary is subtract-old + add-new (which is one or two
                    // buckets in the same year, or two months across years). [SPD1]
                    const groupPatch: Record<string, unknown> = {};
                    if (oldYear === newYear) {
                        groupPatch[`spendByYear.${newYear}`] = increment(
                            toMoney(resolved.cost - original.cost),
                        );
                    } else {
                        // A date edit across a year boundary moves the whole cost
                        // from one bucket to the other.
                        groupPatch[`spendByYear.${oldYear}`] = increment(-original.cost);
                        groupPatch[`spendByYear.${newYear}`] = increment(resolved.cost);
                    }
                    if (oldMonth === newMonth) {
                        groupPatch[`spendByMonth.${newMonth}`] = increment(
                            toMoney(resolved.cost - original.cost),
                        );
                    } else {
                        groupPatch[`spendByMonth.${oldMonth}`] = increment(-original.cost);
                        groupPatch[`spendByMonth.${newMonth}`] = increment(resolved.cost);
                    }
                    batch.update(groupRef(), groupPatch);
                });
                addToast(locale.logs.updated, "success");
                return true;
            } catch (error: unknown) {
                console.error("Update log error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, canSaveOnline, carId, carRef, groupId, groupRef, locale],
    );

    // ── Delete ─────────────────────────────────────────────────────────────
    const deleteLog = useCallback(
        async (entry: Log): Promise<boolean> => {
            if (!groupId || !carId || !canSaveOnline()) return false;

            setIsSaving(true);
            try {
                await runTransaction(db, async (batch) => {
                    const currentCar = await batch.get(carRef());
                    if (!currentCar.exists()) throw new Error("Car is unavailable.");
                    const logRef = doc(db, "groups", groupId, "cars", carId, "logs", entry.id);
                    const snapshot = await batch.get(logRef);
                    if (!snapshot.exists()) return;
                    const log = toLog(entry.id, snapshot.data() as Partial<LogDoc>);
                    const reminderPatch = await recomputeReminders(
                        groupId,
                        carId,
                        log.type,
                        log.id,
                        undefined,
                        serviceReminderKey(log),
                    );

                    // [T18, PRT6] Any installed part pinned to this log must
                    // revert to on_hand in the SAME batch. Bounded query — a
                    // log installs at most one part.
                    const linkedParts = await getDocsFromServer(
                        query(
                            collection(db, "groups", groupId, "cars", carId, "parts"),
                            where("installedLogId", "==", log.id),
                            limit(3),
                        ),
                    );

                    batch.delete(logRef);
                    batch.update(carRef(), {
                        totalSpend: increment(-log.cost),
                        ...reminderPatch,
                        [`spendByType.${log.type}`]: increment(-log.cost),
                    });

                    const eventDate = log.date?.toDate() ?? new Date();
                    batch.update(groupRef(), {
                        [`spendByYear.${spendYearOf(eventDate)}`]: increment(-log.cost),
                        [`spendByMonth.${spendMonthOf(eventDate)}`]: increment(-log.cost),
                    });

                    for (const partSnap of linkedParts.docs) {
                        batch.update(partSnap.ref, {
                            status: "on_hand",
                            installedLogId: deleteField(),
                        });
                    }
                });
                addToast(locale.logs.deleted, "info");
                return true;
            } catch (error: unknown) {
                console.error("Delete log error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, canSaveOnline, carId, carRef, groupId, groupRef, locale],
    );

    return {
        createLog,
        createVisit,
        updateLog,
        deleteLog,
        isSaving,
        errors,
        visitErrors,
        clearError,
        clearVisitError,
    };
};
