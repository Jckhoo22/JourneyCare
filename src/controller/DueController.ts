import { useEffect, useMemo, useRef, useState } from "react";
import {
    collection,
    doc,
    limit,
    onSnapshot,
    query,
    writeBatch,
} from "firebase/firestore";

import { db } from "../configurations/firebase-config";
import { useLanguage } from "../context/LanguageContext";
import { useUser } from "../context/UserContext";
import { hasCarEdit, toCar, type Car, type CarDoc } from "../model/Car";
import type { Group } from "../model/Group";
import type { Locale } from "../locale/English";
import { dueForCar, dueTypeLabel, formatDue } from "../model/Due";
import { carDisplayName } from "../model/Car";
import { dueNotification } from "../model/Notification";
import {
    addTallies,
    detectChanges,
    hasNoChanges,
    nextStamp,
    stampFor,
    tally,
    EMPTY_TALLY,
    type DueChanges,
    type DueTally,
} from "../lib/nextDue";

/**
 * Same ceiling the group screen's car listener uses. A family group holds a
 * handful of cars; this exists so the bound is explicit, not because it's
 * expected to bite. [CONTEXT read-amplification lesson]
 */
const CARS_LIMIT = 50;

/** Cars for every group the user is in, keyed by group id. */
export type CarsByGroup = Record<string, Car[]>;

/**
 * One bounded cars listener per group. [R3]
 *
 * The home strip needs every group's cars, and home only listens to the groups
 * themselves — so this is a genuinely new subscription. It is bounded on both
 * axes: N is the user's own group count (one or two, for a family), and each
 * listener carries the same 50-car limit the group screen uses. Nothing here
 * reads log history; status comes entirely from the `lastByType` T12
 * denormalises onto the car.
 *
 * The alternative — a due counter denormalised onto the group document — would
 * have meant a new write path on every log mutation, which T13 explicitly
 * isn't taking on.
 */
export const useCarsAcrossGroups = (groups: Group[]): CarsByGroup => {
    const [carsByGroup, setCarsByGroup] = useState<CarsByGroup>({});

    // A stable key, so re-rendering with an equal-but-new array doesn't tear
    // down and rebuild every listener.
    const groupIds = groups.map((group) => group.id).sort().join(",");

    useEffect(() => {
        const ids = groupIds ? groupIds.split(",") : [];
        if (ids.length === 0) return;

        const unsubscribes = ids.map((groupId) =>
            onSnapshot(
                query(
                    collection(db, "groups", groupId, "cars"),
                    limit(CARS_LIMIT),
                ),
                (result) => {
                    setCarsByGroup((current) => ({
                        ...current,
                        [groupId]: result.docs.map((entry) =>
                            toCar(entry.id, entry.data() as Partial<CarDoc>),
                        ),
                    }));
                },
                (error) => {
                    // A group whose cars can't be read shouldn't blank the
                    // strip for every other group.
                    console.warn(`Cars listener failed for ${groupId}:`, error);
                    setCarsByGroup((current) => ({ ...current, [groupId]: [] }));
                },
            ),
        );

        return () => unsubscribes.forEach((stop) => stop());
    }, [groupIds]);

    // Groups the user has left are filtered out on the way OUT rather than
    // cleared inside the effect — a setState in an effect body cascades a
    // render, and this says the same thing by deriving it. The memo keeps the
    // identity stable, so the notification effect downstream doesn't re-run on
    // every render of the home screen.
    return useMemo(() => {
        const ids = groupIds ? groupIds.split(",") : [];
        const current: CarsByGroup = {};

        ids.forEach((groupId) => {
            const cars = carsByGroup[groupId];
            if (cars) current[groupId] = cars;
        });

        return current;
    }, [carsByGroup, groupIds]);
};

/** Due counts per group, and the total. [R3] */
export const tallyByGroup = (
    carsByGroup: CarsByGroup,
    now: Date = new Date(),
): { byGroup: Record<string, DueTally>; total: DueTally } => {
    const byGroup: Record<string, DueTally> = {};
    let total = EMPTY_TALLY;

    Object.entries(carsByGroup).forEach(([groupId, cars]) => {
        const groupTally = cars
            .map((car) => tally(dueForCar(car, now)))
            .reduce(addTallies, EMPTY_TALLY);

        byGroup[groupId] = groupTally;
        total = addTallies(total, groupTally);
    });

    return { byGroup, total };
};

/**
 * R4: one notification per car+type per status change, and no more.
 *
 * Detection happens on render, comparing each computed status against
 * `car.statusStamp`. A stamp that already matches produces NOTHING — which is
 * the whole point. Opening the app twice must not notify twice.
 *
 * ── Who is told, and by whom ────────────────────────────────────────────────
 * R4 as written says "for cars the user can view". This notifies **car-EDIT
 * holders** instead: they are the people who can act on it, and a reminder
 * you're not permitted to do anything about is noise. Recorded in spec.md.
 *
 * The detector is whoever opens the app — but only if THEY hold edit on that
 * car, so a view-only member never generates notifications for other people.
 * They do notify themselves along with the other holders: on a car with a
 * single edit holder (the common case — the owner added it), excluding the
 * detector would mean nobody is ever told.
 *
 * ── Where it runs ───────────────────────────────────────────────────────────
 * Home only, and deliberately: home already holds every group's cars, it's the
 * screen the app opens on, and one writer means the group and car pages can
 * render status without racing each other to stamp it.
 *
 * ── The honest gap ──────────────────────────────────────────────────────────
 * Two devices opening the app in the same second can both detect a transition
 * before either stamp lands, producing two identical notifications. The window
 * is one round trip and the worst case is a duplicate line in a list, so it's
 * left alone: a deterministic document id would collapse the duplicate but
 * would then collide with the same car+type crossing again next year.
 */
export const useDueNotifications = (
    groups: Group[],
    carsByGroup: CarsByGroup,
): void => {
    const { user } = useUser();
    const { locale } = useLanguage();
    const uid = user?.uid;

    // Transitions already written by THIS client, so a re-render before the
    // stamp round-trips doesn't fire a second time.
    const inFlight = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!uid) return;

        const now = new Date();

        groups.forEach((group) => {
            const cars = carsByGroup[group.id] ?? [];

            cars.forEach((car) => {
                // Only an edit holder writes. A view-only member watching the
                // same car generates nothing for anybody.
                if (!hasCarEdit(car, uid, group.ownerId)) return;

                // The dedupe lives in lib/nextDue — pure, so the property that
                // matters is unit-tested rather than argued about here.
                const changes = detectChanges(
                    dueForCar(car, now),
                    car.statusStamp,
                );
                if (hasNoChanges(changes)) return;

                // A second guard, for the gap between committing and the
                // snapshot coming back: without it a re-render in that window
                // would see the old stamp and write again.
                const key = changeKey(car.id, changes);
                if (inFlight.current.has(key)) return;
                inFlight.current.add(key);

                void writeChanges(group, car, changes, locale).catch(
                    (error: unknown) => {
                        inFlight.current.delete(key);
                        // Never fatal: a missed reminder must not break the
                        // screen someone opened to see their groups.
                        console.warn(
                            "Could not record due notifications:",
                            error,
                        );
                    },
                );
            });
        });
    }, [carsByGroup, groups, locale, uid]);
};

/** Identifies exactly this set of changes, for the in-flight guard. */
const changeKey = (carId: string, changes: DueChanges): string =>
    `${carId}:${changes.transitions
        .map((entry) => `${entry.type}=${stampFor(entry.status)}`)
        .join(",")}:${changes.cleared.join(",")}`;

/**
 * One batch: every notification for this car, and the updated stamp.
 *
 * Batched for the same reason every other denormalisation in this app is — a
 * stamp that moved without its notification means a reminder nobody ever gets,
 * and a notification without the stamp means one they get on every app open.
 *
 * The stamp is written as a WHOLE MAP rather than patched key by key: a
 * recovered type has to LEAVE it, and one value is what the rules can
 * validate.
 */
const writeChanges = async (
    group: Group,
    car: Car,
    changes: DueChanges,
    locale: Locale,
): Promise<void> => {
    const batch = writeBatch(db);

    // Everyone with edit on this car — they're the ones who can act. Includes
    // the person who noticed; on a one-holder car, excluding them would mean
    // nobody is told.
    const recipients = group.memberIds.filter((memberId) =>
        hasCarEdit(car, memberId, group.ownerId),
    );

    changes.transitions.forEach((entry) => {
        const dueLabel = formatDue(entry.item, locale);

        recipients.forEach((memberId) => {
            batch.set(
                doc(collection(db, "notifications", memberId, "items")),
                dueNotification(
                    stampFor(entry.status),
                    group.id,
                    group.name,
                    car.id,
                    carDisplayName(car),
                    dueTypeLabel(entry.type, car),
                    dueLabel,
                    // [T19, I18N5] Raw params ride alongside dueLabel so
                    // the reader's language, not the sender's, formats the
                    // date + km. Old notifications without these fall
                    // through to the point-in-time dueLabel string.
                    {
                        dueDateMs: entry.item.dueDate?.getTime(),
                        dueKm: entry.item.dueKm,
                    },
                ),
            );
        });
    });

    batch.update(doc(db, "groups", group.id, "cars", car.id), {
        statusStamp: nextStamp(car.statusStamp, changes),
    });

    await batch.commit();
};
