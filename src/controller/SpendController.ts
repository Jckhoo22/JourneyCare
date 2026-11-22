import { useCallback, useState } from "react";
import {
    collection,
    doc,
    getDocsFromServer,
    limit,
    orderBy,
    query,
    startAfter,
    runTransaction,
    type DocumentData,
    type Query,
    type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "../configurations/firebase-config";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/Toast";
import { toCar, type CarDoc } from "../model/Car";
import { toGroup, type GroupDoc } from "../model/Group";
import {
    compareServiceOrder,
    serviceReminderKey,
    toLastService,
    toLog,
    type LastServiceSummary,
    type Log,
    type LogDoc,
} from "../model/Log";
import { sameAmountMap, sameSpendByYear, spendMonthOf, spendYearOf } from "../lib/spend";
import { toMoney } from "../utils/money";
import {
    getErrorCode,
    getFirebaseErrorMessage,
} from "../utils/firebaseErrorMapper";

/**
 * How much history one round trip fetches, and how many round trips are
 * allowed.
 *
 * Recalculate is the one place in this app that deliberately reads everything —
 * that is what makes it a repair and not another estimate. It is still PAGED
 * rather than unbounded, for the reason every listener here is bounded: an
 * unbounded read is a bill nobody predicted. 10,000 entries per car is far past
 * anything a family produces, and hitting the ceiling ABORTS rather than
 * truncating, because a total computed from part of the history is worse than
 * no recalculation at all — it would overwrite a correct number with a wrong
 * one and report success.
 */
const RECALC_PAGE_SIZE = 500;
const RECALC_MAX_PAGES = 20;

/** Firestore's batch ceiling is 500 writes; this leaves room to spare. */
const MAX_REPAIR_WRITES = 400;

export interface RecalcResult {
    /** Cars read. */
    cars: number;
    /** Log entries read across all of them. */
    entries: number;
    /** Documents whose stored totals disagreed and were rewritten. */
    corrected: number;
}

/** Everything one car's history says about that car and its group. */
interface CarTotals {
    totalSpend: number;
    lastByType: Record<string, LastServiceSummary>;
    /** Per-type spend, keyed by log's `type` id. [T20, SPD1] */
    byType: Record<string, number>;
    byYear: Record<string, number>;
    /** Per-month spend, keyed "YYYY-MM". [T20, SPD1] */
    byMonth: Record<string, number>;
    entries: number;
}

/**
 * Every log on one car, newest first, in bounded pages.
 *
 * `orderBy('date')` is what makes the newest-per-type pass below a single
 * sweep: the first entry of a given type IS that type's last service, so
 * `lastByType` falls out without a second query per type.
 */
const readAllLogs = async (groupId: string, carId: string): Promise<Log[]> => {
    const logsRef = collection(db, "groups", groupId, "cars", carId, "logs");
    const logs: Log[] = [];
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

    for (let page = 0; page < RECALC_MAX_PAGES; page += 1) {
        // Annotated because `cursor` is assigned FROM this query's result, and
        // without a written type the inference chain is circular.
        const pageQuery: Query<DocumentData> = cursor
            ? query(
                  logsRef,
                  orderBy("date", "desc"),
                  startAfter(cursor),
                  limit(RECALC_PAGE_SIZE),
              )
            : query(logsRef, orderBy("date", "desc"), limit(RECALC_PAGE_SIZE));

        const result = await getDocsFromServer(pageQuery);
        result.docs.forEach((entry) =>
            logs.push(toLog(entry.id, entry.data() as Partial<LogDoc>)),
        );

        if (result.docs.length < RECALC_PAGE_SIZE) return logs;
        cursor = result.docs[result.docs.length - 1];
    }

    throw new Error("RECALC_TOO_MANY_ENTRIES");
};

/**
 * What the history says the counters should be.
 *
 * The same three numbers `useLogActions` maintains incrementally, computed here
 * from scratch — so this function and that batch are two independent
 * derivations of one truth, and Recalculate reporting "everything already
 * agreed" is them agreeing.
 */
const totalsFromLogs = (logs: Log[]): CarTotals => {
    const lastByType: Record<string, LastServiceSummary> = {};
    // Which entry won each type, so a same-day pair resolves the same way
    // every run. See the tiebreak note below.
    const winners = new Map<string, Log>();
    const byYear: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalSpend = 0;

    logs.forEach((log) => {
        totalSpend += log.cost;
        // Per-type accumulator. Not dependent on the date-present branch —
        // a log without a date still contributed to the total, and the
        // by-type breakdown should reflect that too. Rounded per bucket
        // to match the batched delta rules that maintain it live.
        byType[log.type] = toMoney((byType[log.type] ?? 0) + log.cost);

        if (!log.date) return;

        const key = serviceReminderKey(log);
        const winner = winners.get(key);
        if (!winner || compareServiceOrder(log, winner) > 0) {
            winners.set(key, log);
            lastByType[key] = toLastService(log.date, log);
        }

        const eventDate = log.date.toDate();
        const year = spendYearOf(eventDate);
        const month = spendMonthOf(eventDate);
        byYear[year] = toMoney((byYear[year] ?? 0) + log.cost);
        byMonth[month] = toMoney((byMonth[month] ?? 0) + log.cost);
    });

    return {
        totalSpend: toMoney(totalSpend),
        lastByType,
        byType,
        byYear,
        byMonth,
        entries: logs.length,
    };
};

/** Whether two `lastByType` summaries say the same thing about a service. */
const sameLastService = (
    a: LastServiceSummary | undefined,
    b: LastServiceSummary | undefined,
): boolean => {
    if (!a || !b) return a === b;

    return (
        a.date.toMillis() === b.date.toMillis() &&
        a.customLabel === b.customLabel &&
        a.odometer === b.odometer &&
        a.intervalKm === b.intervalKm &&
        a.intervalMonths === b.intervalMonths
    );
};

const sameLastByType = (
    a: Record<string, LastServiceSummary>,
    b: Record<string, LastServiceSummary>,
): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
        if (!sameLastService(a[key], b[key])) return false;
    }
    return true;
};

interface PendingWrite {
    path: string[];
    data: Record<string, unknown>;
}

interface UseRecalculateResult {
    recalculate: (groupId: string) => Promise<RecalcResult | null>;
    isRecalculating: boolean;
}

/**
 * "Recalculate totals" — the self-heal every denormalised counter here needs.
 * [plan.md § Spend totals, S1–S3]
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `car.totalSpend` and `group.spendByYear` are maintained by the CLIENT, in the
 * same batch as each log write. The security rules cannot check that linkage:
 * a batch's writes are evaluated independently, so from the car's rule the
 * sibling log is invisible (the same wall `carCount` hit in T9). Every
 * denormalisation in this project is therefore trusted-but-repairable, and this
 * is the repair.
 *
 * Drift is not hypothetical. A batch that fails halfway is atomic and safe, but
 * a browser closed mid-write, a document edited by hand in the console, or a
 * future bug in the delta arithmetic all land the same way: a number on
 * someone's home screen that disagrees with the history behind it.
 *
 * ── What it costs ───────────────────────────────────────────────────────────
 * One read per log entry in the group, which is the only honest way to do it —
 * hence owner-only, behind a menu, behind a confirm. At family scale (a few
 * cars, a few dozen entries each) that is a few hundred reads against a 50,000
 * per day free quota.
 *
 * ── What it writes ──────────────────────────────────────────────────────────
 * Only documents that actually disagree. A healthy group produces ZERO writes
 * and the "everything already agreed" message, which is what makes running it
 * a way to VERIFY the counters rather than just a way to overwrite them.
 */
export const useRecalculateSpend = (): UseRecalculateResult => {
    const { addToast } = useToast();
    const { locale } = useLanguage();
    const [isRecalculating, setIsRecalculating] = useState(false);

    const recalculate = useCallback(
        async (groupId: string): Promise<RecalcResult | null> => {
            setIsRecalculating(true);
            try {
                const result = await runTransaction(db, async (transaction): Promise<RecalcResult> => {
                    const groupRef = doc(db, "groups", groupId);
                    const groupSnapshot = await transaction.get(groupRef);
                    if (!groupSnapshot.exists()) throw new Error("Group is unavailable.");
                    const group = toGroup(groupId, groupSnapshot.data() as Partial<GroupDoc>);
                    // Reading the group version fences concurrent log writes,
                    // since each one also changes the group spend counters.
                    const carRefs = await getDocsFromServer(collection(db, "groups", groupId, "cars"));
                    if (carRefs.docs.length + 1 > MAX_REPAIR_WRITES) {
                        throw new Error("RECALC_TOO_MANY_ENTRIES");
                    }
                    const carSnapshots = await Promise.all(carRefs.docs.map((entry) => transaction.get(entry.ref)));
                    const cars = carSnapshots
                        .filter((entry) => entry.exists())
                        .map((entry) => toCar(entry.id, entry.data() as Partial<CarDoc>));
                    const writes: PendingWrite[] = [];
                    const groupByYear: Record<string, number> = {};
                    const groupByMonth: Record<string, number> = {};
                    let entries = 0;

                    for (const car of cars) {
                        const totals = totalsFromLogs(
                            await readAllLogs(group.id, car.id),
                        );
                        entries += totals.entries;

                        Object.entries(totals.byYear).forEach(([year, amount]) => {
                            groupByYear[year] = toMoney(
                                (groupByYear[year] ?? 0) + amount,
                            );
                        });
                        Object.entries(totals.byMonth).forEach(([month, amount]) => {
                            groupByMonth[month] = toMoney(
                                (groupByMonth[month] ?? 0) + amount,
                            );
                        });

                        // Untouched when it already agrees — that silence is the
                        // whole value of the "nothing needed fixing" report. Now
                        // covers spendByType too: T20 pins the donut on this.
                        const carNeedsWrite =
                            toMoney(car.totalSpend) !== totals.totalSpend ||
                            !sameLastByType(car.lastByType, totals.lastByType) ||
                            !sameAmountMap(car.spendByType, totals.byType);

                        if (carNeedsWrite) {
                            writes.push({
                                path: ["groups", group.id, "cars", car.id],
                                // Written as WHOLE maps, not per-key patches: a
                                // service type whose last entry was deleted has to
                                // LEAVE `lastByType`, and only a replacement can
                                // remove a key that shouldn't be there. Same for
                                // `spendByType` — a type that no longer appears
                                // has to leave the map.
                                data: {
                                    totalSpend: totals.totalSpend,
                                    lastByType: totals.lastByType,
                                    spendByType: totals.byType,
                                },
                            });
                        }
                    }

                    if (
                        !sameSpendByYear(group.spendByYear, groupByYear) ||
                        !sameAmountMap(group.spendByMonth, groupByMonth)
                    ) {
                        writes.push({
                            path: ["groups", group.id],
                            data: {
                                spendByYear: groupByYear,
                                spendByMonth: groupByMonth,
                            },
                        });
                    }

                    for (const write of writes) {
                        const [first, ...rest] = write.path;
                        transaction.update(doc(db, first, ...rest), write.data);
                    }

                    return { cars: cars.length, entries, corrected: writes.length };
                });

                const counts = {
                    cars: (result.cars === 1
                        ? locale.spend.carCount
                        : locale.spend.carCountPlural
                    ).replace("{count}", String(result.cars)),
                    entries: (result.entries === 1
                        ? locale.spend.entryCount
                        : locale.spend.entryCountPlural
                    ).replace("{count}", String(result.entries)),
                };

                addToast(
                    (result.corrected === 0
                        ? locale.spend.recalculateClean
                        : locale.spend.recalculateFixed.replace(
                              "{corrected}",
                              String(result.corrected),
                          )
                    )
                        .replace("{cars}", counts.cars)
                        .replace("{entries}", counts.entries),
                    result.corrected === 0 ? "success" : "info",
                );

                return result;
            } catch (error: unknown) {
                console.error("Recalculate error:", error);
                addToast(
                    error instanceof Error &&
                        error.message === "RECALC_TOO_MANY_ENTRIES"
                        ? locale.spend.recalculateTooMany
                        : getFirebaseErrorMessage(getErrorCode(error)),
                    "error",
                );
                return null;
            } finally {
                setIsRecalculating(false);
            }
        },
        [addToast, locale],
    );

    return { recalculate, isRecalculating };
};
