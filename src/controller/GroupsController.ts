import { useCallback, useEffect, useState } from "react";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    increment,
    limit,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    where,
    writeBatch,
} from "firebase/firestore";

import { db } from "../configurations/firebase-config";
import { useToast } from "../context/Toast";
import { useLanguage } from "../context/LanguageContext";
import { useUser } from "../context/UserContext";
import { isValidGroupName } from "../constants/regex";
import {
    toGroup,
    withCarAdder,
    withoutMember,
    type Group,
    type GroupDoc,
} from "../model/Group";
import { decisionNotification, renameNotification } from "../model/Notification";
import { generateJoinToken } from "../utils/joinToken";
import {
    getErrorCode,
    getFirebaseErrorMessage,
} from "../utils/firebaseErrorMapper";

interface UseGroupsResult {
    groups: Group[];
    /** True until the first snapshot lands, so the list can avoid flashing the empty state. */
    isLoading: boolean;
    error: string | null;
}

/** What the listener last reported, tagged with the uid it reported it for. */
interface Snapshot {
    uid: string;
    groups: Group[];
    error: string | null;
}

/**
 * Live list of the groups the signed-in user belongs to. [H2]
 *
 * `memberIds array-contains uid` mirrors the read rule in firestore.rules, which
 * is what makes the query permissible — a broader query would be rejected
 * outright rather than filtered down.
 */
export const useGroups = (): UseGroupsResult => {
    const { user } = useUser();
    const uid = user?.uid;

    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

    useEffect(() => {
        if (!uid) return;

        const groupsQuery = query(
            collection(db, "groups"),
            where("memberIds", "array-contains", uid),
        );

        // Every setState below happens in a listener callback, never in the
        // effect body — the loading and reset states are derived instead, so
        // switching accounts can't cascade an extra render.
        const unsubscribe = onSnapshot(
            groupsQuery,
            (result) => {
                setSnapshot({
                    uid,
                    groups: result.docs.map((entry) =>
                        toGroup(entry.id, entry.data() as Partial<GroupDoc>),
                    ),
                    error: null,
                });
            },
            (snapshotError) => {
                console.error("Groups listener error:", snapshotError);
                setSnapshot({
                    uid,
                    groups: [],
                    error: getFirebaseErrorMessage(getErrorCode(snapshotError)),
                });
            },
        );

        return () => unsubscribe();
    }, [uid]);

    // A snapshot belonging to a previous uid is stale: treat it as "still
    // loading" rather than briefly showing the last account's groups.
    const isCurrent = snapshot !== null && snapshot.uid === uid;

    // A missing uid also counts as loading, not as "no groups". Every consumer
    // sits behind RequireVerified, so there is always a user in the end — and
    // reporting an empty result during that gap would flash the empty state
    // [H5] at someone who actually has groups.
    return {
        groups: isCurrent ? snapshot.groups : [],
        isLoading: !isCurrent,
        error: isCurrent ? snapshot.error : null,
    };
};

/**
 * uids already reconciled this session, so the repair below runs at most once
 * per sign-in even as the home screen mounts and unmounts.
 */
const syncedGroupsOwned = new Set<string>();

/**
 * Repairs `users/{uid}.groupsOwned` from the groups already on screen. [P3b]
 *
 * T9 introduces this counter, so every profile that existed before it is
 * wrong — and the counter is decremented on group delete, where a wrong value
 * would clamp at zero and stay wrong forever.
 *
 * tasks.md offered a one-off backfill script or console edits. This is
 * neither, and deliberately: the home screen already holds the definitive list
 * of the user's groups, and UserContext already read the stored counter as
 * part of the session, so the true value and the recorded one are both in hand
 * for free. Writing the difference costs one write, once, only when they
 * disagree — and it fixes every user automatically, including any who arrive
 * later, rather than the handful someone remembers to run a script for. It is
 * the same self-healing move `ensurePublicInfo` makes for the invite window.
 *
 * Pass the count only once the groups snapshot has actually landed; an
 * `isLoading` list would otherwise "repair" the counter to zero.
 */
export const useSyncGroupsOwned = (
    ownedCount: number,
    ready: boolean,
): void => {
    const { user } = useUser();
    const uid = user?.uid;
    const recorded = user?.groupsOwned ?? 0;

    useEffect(() => {
        if (!ready || !uid) return;
        if (recorded === ownedCount) return;
        if (syncedGroupsOwned.has(uid)) return;

        syncedGroupsOwned.add(uid);

        // Best-effort and silent: a wrong advisory counter is not worth a toast,
        // and the user did nothing to cause it.
        void setDoc(
            doc(db, "users", uid),
            { groupsOwned: ownedCount },
            { merge: true },
        ).catch((error: unknown) => {
            syncedGroupsOwned.delete(uid);
            console.warn("Could not reconcile groupsOwned:", error);
        });
    }, [ownedCount, ready, recorded, uid]);
};

interface UseGroupResult {
    group: Group | null;
    isLoading: boolean;
    /** True once we know the group is absent or unreadable. [G2] */
    notFound: boolean;
}

/** What the single-document listener last reported, tagged with its group id. */
interface DocSnapshot {
    groupId: string;
    group: Group | null;
}

/**
 * Live view of one group. [G2]
 *
 * A denied read and a genuinely missing document collapse to the same
 * `notFound` result on purpose: telling a non-member "this exists but you can't
 * see it" leaks the group's existence.
 */
export const useGroup = (groupId: string | undefined): UseGroupResult => {
    const [snapshot, setSnapshot] = useState<DocSnapshot | null>(null);

    useEffect(() => {
        if (!groupId) return;

        const unsubscribe = onSnapshot(
            doc(db, "groups", groupId),
            (result) => {
                setSnapshot({
                    groupId,
                    group: result.exists()
                        ? toGroup(result.id, result.data() as Partial<GroupDoc>)
                        : null,
                });
            },
            (snapshotError) => {
                // Permission denied lands here. Same outcome as absent.
                console.error("Group listener error:", snapshotError);
                setSnapshot({ groupId, group: null });
            },
        );

        return () => unsubscribe();
    }, [groupId]);

    const isCurrent = snapshot !== null && snapshot.groupId === groupId;

    return {
        group: isCurrent ? snapshot.group : null,
        isLoading: !isCurrent,
        notFound: isCurrent && snapshot.group === null,
    };
};

/**
 * Makes sure `groups/{id}/public/info` exists and holds BOTH the group's
 * current name and its ownerId.
 *
 * Owner-only (the rules require it), idempotent, and safe to call on every
 * visit to the Invite screen. This is what heals groups created before the
 * public window existed — no manual backfill needed.
 *
 * The `ownerId` half of that check is not decoration. That field is the only
 * way a would-be joiner can learn who to address their "X wants to join"
 * notification to: the group document itself is members-only, so a
 * not-yet-member can read nothing else about it. An earlier version compared
 * the name alone and returned early when it matched — which meant a public
 * window written before `ownerId` existed was never repaired, and every join
 * request against that group silently posted with no owner to notify. [N1]
 */
export const ensurePublicInfo = async (group: Group): Promise<void> => {
    const ref = doc(db, "groups", group.id, "public", "info");

    const snapshot = await getDoc(ref);
    const current = snapshot.exists() ? snapshot.data() : null;

    if (
        current?.name === group.name &&
        current?.ownerId === group.ownerId
    ) {
        return;
    }

    await setDoc(ref, { name: group.name, ownerId: group.ownerId });
};

interface UseMemberActionsResult {
    /** Owner removes someone else. */
    removeMember: (group: Group, uid: string, username: string) => Promise<boolean>;
    /** A non-owner member removes themselves. */
    leaveGroup: (group: Group, uid: string) => Promise<boolean>;
    busyUid: string | null;
}

/**
 * Removing a member, and leaving. [G10]
 *
 * Both are the same write — drop one uid from `memberIds`, the `members` map
 * and `canAddCars` together — and the rules tell them apart by who is asking:
 * an owner may remove anyone but themselves, a member may remove only
 * themselves. See firestore.rules § isOwnerUpdate / isSelfRemoval.
 */
export const useMemberActions = (): UseMemberActionsResult => {
    const { addToast } = useToast();
    const { locale } = useLanguage();

    const [busyUid, setBusyUid] = useState<string | null>(null);

    /**
     * Batched even though it touches one document: it keeps membership changes
     * shaped like the accept in JoinController, and Phase 2 will add per-car
     * access cleanup to the same batch. [G8]
     */
    const applyRemoval = useCallback(
        async (
            group: Group,
            uid: string,
            successMessage: string,
            { notify }: { notify: boolean },
        ) => {
            setBusyUid(uid);
            try {
                const batch = writeBatch(db);
                batch.update(doc(db, "groups", group.id), withoutMember(group, uid));

                // Only an owner-initiated removal notifies. Leaving voluntarily
                // tells you nothing you don't already know. [N1]
                if (notify) {
                    batch.set(
                        doc(collection(db, "notifications", uid, "items")),
                        decisionNotification(
                            "removed_from_group",
                            group.id,
                            group.name,
                        ),
                    );
                }

                await batch.commit();

                addToast(successMessage, "info");
                return true;
            } catch (error: unknown) {
                console.error("Member removal failed:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setBusyUid(null);
            }
        },
        [addToast],
    );

    const removeMember = useCallback(
        (group: Group, uid: string, username: string) =>
            applyRemoval(
                group,
                uid,
                locale.members.removed.replace("{name}", username),
                { notify: true },
            ),
        [applyRemoval, locale],
    );

    const leaveGroup = useCallback(
        (group: Group, uid: string) =>
            applyRemoval(
                group,
                uid,
                locale.members.left.replace("{name}", group.name),
                { notify: false },
            ),
        [applyRemoval, locale],
    );

    return { removeMember, leaveGroup, busyUid };
};

interface UseGroupActionsResult {
    createGroup: (name: string) => Promise<string | null>;
    deleteGroup: (groupId: string) => Promise<boolean>;
    isSaving: boolean;
    nameError: string;
    clearNameError: () => void;
}

/** Create and delete. Both mirror what firestore.rules will actually accept. */
export const useGroupActions = (): UseGroupActionsResult => {
    const { user } = useUser();
    const { addToast } = useToast();
    const { locale } = useLanguage();

    // Read the two fields the callback actually needs, so its dependency list
    // names exactly what it closes over.
    const uid = user?.uid;
    const username = user?.username ?? "";

    const [isSaving, setIsSaving] = useState(false);
    const [nameError, setNameError] = useState("");

    const clearNameError = useCallback(() => setNameError(""), []);

    /**
     * Creates a group with the caller seeded as sole member and owner. [G1]
     * Resolves to the new group's id, or null if it didn't happen.
     */
    const createGroup = useCallback(
        async (rawName: string): Promise<string | null> => {
            if (!uid) return null;

            const name = rawName.trim();
            if (!isValidGroupName(name)) {
                setNameError(
                    name ? locale.errors.groupNameTooLong : locale.errors.required,
                );
                return null;
            }

            setIsSaving(true);
            try {
                // Auto-id up front so both documents can go in one batch.
                const groupRef = doc(collection(db, "groups"));
                const batch = writeBatch(db);

                // This shape is pinned by the create rule: ownerId, memberIds,
                // members and canAddCars must all be exactly this one user.
                batch.set(groupRef, {
                    name,
                    ownerId: uid,
                    memberIds: [uid],
                    members: {
                        [uid]: {
                            username,
                            joinedAt: serverTimestamp(),
                        },
                    },
                    canAddCars: [uid],
                    joinToken: generateJoinToken(),
                    createdAt: serverTimestamp(),
                });

                // The invited-stranger window. Without it an invitee cannot be
                // shown what they are joining, because the group document is
                // members-only. [G5]
                batch.set(doc(db, "groups", groupRef.id, "public", "info"), {
                    name,
                    ownerId: uid,
                });

                // Same batch, so the counter Phase 3's limits will read stays
                // in step with the groups that actually exist. [P3b]
                batch.update(doc(db, "users", uid), {
                    groupsOwned: increment(1),
                });

                await batch.commit();

                addToast(
                    locale.groups.created.replace("{name}", name),
                    "success",
                );
                return groupRef.id;
            } catch (error: unknown) {
                console.error("Create group error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return null;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, locale, uid, username],
    );

    /**
     * Deletes a group and everything under it. Owner-only — enforced by the
     * rules, not just the UI. [G11, C8]
     *
     * ── The cascade, and why it had to be built ─────────────────────────────
     * Firestore never deletes subcollections with their parent. Phase 1 got
     * away with that: the only child was `public/info`, handled below. BUGS.md
     * recorded the consequence in advance — "when Phase 2 adds cars, a
     * client-side delete will orphan them" — and the T16 sweep is where that
     * came due.
     *
     * Orphans here are not merely untidy. A car document can hold a 250,000
     * character photo [C5, D4], and once its group is gone NOTHING can reach
     * it: the cars rules require the group to exist and the reader to be in
     * its `memberIds`, so an orphaned car is unreadable, undeletable through
     * any UI, and permanent — megabytes charged against a 1GB free tier that
     * nobody can ever reclaim. On a zero-cost project that is the expensive
     * kind of leak.
     *
     * ── Order matters, twice ────────────────────────────────────────────────
     * Deepest first: logs, then cars, then the group. Every child's delete
     * rule calls `groupExists()`, so the group has to still be there while
     * they go — deleting it first would strand everything beneath it with no
     * way back in. And if the run dies partway, what survives is a group with
     * fewer cars: visible, still owned, and fixed by pressing delete again.
     */
    const deleteGroup = useCallback(
        async (groupId: string): Promise<boolean> => {
            if (!uid) return false;

            setIsSaving(true);
            try {
                // Bounded by the same ceiling the group screen's listener uses;
                // a group past it needs deleting twice, which is honest and
                // recoverable, where an unbounded read is a surprise bill.
                const cars = await getDocs(
                    query(collection(db, "groups", groupId, "cars"), limit(50)),
                );

                for (const car of cars.docs) {
                    const logs = await getDocs(
                        collection(db, "groups", groupId, "cars", car.id, "logs"),
                    );
                    for (let from = 0; from < logs.docs.length; from += 400) {
                        const logBatch = writeBatch(db);
                        logs.docs
                            .slice(from, from + 400)
                            .forEach((entry) => logBatch.delete(entry.ref));
                        await logBatch.commit();
                    }
                }

                for (let from = 0; from < cars.docs.length; from += 400) {
                    const carBatch = writeBatch(db);
                    cars.docs
                        .slice(from, from + 400)
                        .forEach((car) => carBatch.delete(car.ref));
                    await carBatch.commit();
                }

                // The public window goes with it, in the same batch. Left
                // behind, an old invite link would still show the group's name
                // and offer a Request button that could only ever fail. Its
                // delete rule needs the group to still exist, which pre-batch
                // state satisfies.
                const batch = writeBatch(db);
                batch.delete(doc(db, "groups", groupId, "public", "info"));
                batch.delete(doc(db, "groups", groupId));

                // P3b, decremented by absolute value rather than increment(-1).
                //
                // The rules floor `groupsOwned` at zero, so a counter that has
                // drifted low would make increment(-1) go negative and take the
                // whole batch — and the group deletion — down with it. A
                // counter must never be the reason a real action fails, so this
                // reads the current value and clamps. One extra read, on an
                // action nobody performs often.
                const profile = await getDoc(doc(db, "users", uid));
                const owned = profile.data()?.groupsOwned;
                batch.update(doc(db, "users", uid), {
                    groupsOwned: Math.max(
                        0,
                        (typeof owned === "number" ? owned : 1) - 1,
                    ),
                });

                await batch.commit();

                addToast(locale.groups.deleted, "info");
                return true;
            } catch (error: unknown) {
                console.error("Delete group error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, locale, uid],
    );

    return { createGroup, deleteGroup, isSaving, nameError, clearNameError };
};

/**
 * Renaming a group. [G12]
 *
 * One batch: the new name, and a `group_renamed` notification for every member
 * except the person doing it. Batched so the name and the announcement of it
 * can never disagree — and because the rules validate `oldName` against the
 * group document's PRE-batch state, which is only coherent if both writes land
 * together.
 */
export const useRenameGroup = (): {
    renameGroup: (group: Group, name: string) => Promise<boolean>;
    isRenaming: boolean;
    nameError: string;
    clearNameError: () => void;
} => {
    const { user } = useUser();
    const { addToast } = useToast();
    const { locale } = useLanguage();

    const uid = user?.uid;
    const username = user?.username ?? "";

    const [isRenaming, setIsRenaming] = useState(false);
    const [nameError, setNameError] = useState("");

    const clearNameError = useCallback(() => setNameError(""), []);

    const renameGroup = useCallback(
        async (group: Group, rawName: string): Promise<boolean> => {
            if (!uid) return false;

            const name = rawName.trim();
            if (!isValidGroupName(name)) {
                setNameError(
                    name ? locale.errors.groupNameTooLong : locale.errors.required,
                );
                return false;
            }
            // Nothing to announce, and nothing to write.
            if (name === group.name) return true;

            setIsRenaming(true);
            try {
                const batch = writeBatch(db);
                batch.update(doc(db, "groups", group.id), { name });

                // Everyone but the renamer — they just did it, so telling them
                // is noise. [G12]
                group.memberIds
                    .filter((memberId) => memberId !== uid)
                    .forEach((memberId) => {
                        batch.set(
                            doc(collection(db, "notifications", memberId, "items")),
                            renameNotification(
                                group.id,
                                // The name as it stands before this batch —
                                // what the rules will compare against.
                                group.name,
                                name,
                                username,
                            ),
                        );
                    });

                await batch.commit();

                // The public window carries the name an invitee sees, so it has
                // to follow. Best-effort: a stale invite title is not worth
                // failing a rename that already succeeded. [G5]
                void ensurePublicInfo({ ...group, name }).catch(
                    (error: unknown) => {
                        console.warn(
                            "Renamed, but could not update the public group name:",
                            error,
                        );
                    },
                );

                addToast(locale.groups.renamed.replace("{name}", name), "success");
                return true;
            } catch (error: unknown) {
                console.error("Rename group error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsRenaming(false);
            }
        },
        [addToast, locale, uid, username],
    );

    return { renameGroup, isRenaming, nameError, clearNameError };
};

/**
 * Owner-side management of who may add cars. [C1]
 *
 * A single-field update on the group, so it goes through the rules' owner
 * branch — and `carAddersAreMembers()` there rejects any uid that isn't
 * actually in the group, however the array was assembled.
 *
 * Toasting is deliberately the caller's job: PeoplePanel wraps this in
 * `useDebouncedToggle`, which collapses a rapid flip on-off-on into ONE
 * settled write. A toast fired inside the controller would run for every
 * intermediate flip, not the settled one. See the parallel note on
 * `useCarAccessActions`.
 */
export const useCarAdderActions = (): {
    setCarAdder: (group: Group, uid: string, allowed: boolean) => Promise<boolean>;
    busyUid: string | null;
} => {
    const [busyUid, setBusyUid] = useState<string | null>(null);

    const setCarAdder = useCallback(
        async (group: Group, uid: string, allowed: boolean): Promise<boolean> => {
            setBusyUid(uid);
            try {
                await setDoc(
                    doc(db, "groups", group.id),
                    { canAddCars: withCarAdder(group, uid, allowed) },
                    { merge: true },
                );
                return true;
            } catch (error: unknown) {
                console.error("Car-adder toggle failed:", error);
                return false;
            } finally {
                setBusyUid(null);
            }
        },
        [],
    );

    return { setCarAdder, busyUid };
};
