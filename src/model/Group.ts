import type { FieldValue, Timestamp } from "firebase/firestore";

import { currentYear } from "../lib/spend";

/** A group member's denormalised details, kept on the group doc for cheap reads. */
export interface GroupMember {
    username: string;
    joinedAt: Timestamp | FieldValue;
}

/**
 * Shape of a `groups/{groupId}` Firestore document.
 *
 * `memberIds` duplicates the keys of `members` because Firestore cannot query
 * map keys — "list my groups" has to be an array-contains. [H2]
 */
export interface GroupDoc {
    name: string;
    ownerId: string;
    createdAt: Timestamp | FieldValue;
    memberIds: string[];
    members: Record<string, GroupMember>;
    /** uids allowed to add cars, on top of the owner. [C1] */
    canAddCars: string[];
    /** Random token embedded in the invite QR / link. T5 generates it. */
    joinToken: string;
    /**
     * How many cars this group holds. [P3a]
     *
     * Denormalised because Firestore rules cannot count documents, and Phase 3
     * wants to validate a group limit against it. Maintained in the same batch
     * as every car create and delete. Optional: groups made before T9 have no
     * such field, and everything here treats that as zero rather than
     * demanding a migration.
     */
    carCount?: number;
    /**
     * Spend per calendar year, in RM. [S2, D1]
     *
     * Denormalised onto the GROUP rather than summed from its cars because the
     * home screen listens to groups and not to their cars — reading a year's
     * figure has to cost nothing beyond the listener home already has.
     * Maintained in the same batch as every log write (see useLogActions).
     *
     * Optional, and absent means zero: a group that predates T12 has no such
     * field, and a year with no spending in it simply never gets a key. That's
     * also all D1's "year boundary" amounts to — on 1 January the lookup asks
     * for a bucket nobody has written yet and reads back RM 0.00.
     */
    spendByYear?: Record<string, number>;
    /**
     * Spend per calendar MONTH in RM, keyed `"YYYY-MM"`. [SPD1, T20]
     *
     * Denormalised alongside `spendByYear` and maintained in the same batch as
     * every log write. This is what the group page's monthly bar chart reads —
     * it looks up the current year's twelve keys, no query over history.
     *
     * Every month a log has happened in gets a key, not only current-year
     * months: back-dated entries have to accumulate somewhere and the chart
     * simply doesn't render buckets outside its window. Optional and absent
     * means empty; Recalculate is the backfill (T20 extends it).
     */
    spendByMonth?: Record<string, number>;
}

/**
 * A group document paired with its id, as the UI consumes it. `createdAt` is
 * nullable here because a hand-authored console document may not have one.
 */
export interface Group extends Omit<GroupDoc, "createdAt"> {
    id: string;
    createdAt: Timestamp | FieldValue | null;
}

/**
 * Reads a group snapshot defensively. Hand-authored console documents (and
 * anything written before a field existed) can be missing keys, and the home
 * list must render them rather than crash.
 */
export const toGroup = (id: string, data: Partial<GroupDoc>): Group => ({
    id,
    name: data.name?.trim() || "Untitled group",
    ownerId: data.ownerId ?? "",
    createdAt: data.createdAt ?? null,
    memberIds: Array.isArray(data.memberIds) ? data.memberIds : [],
    members: data.members ?? {},
    canAddCars: Array.isArray(data.canAddCars) ? data.canAddCars : [],
    joinToken: data.joinToken ?? "",
    carCount: typeof data.carCount === "number" ? data.carCount : 0,
    spendByYear: data.spendByYear ?? {},
    spendByMonth: data.spendByMonth ?? {},
});

/** Member count for a group card. [H2] */
export const memberCount = (group: Group): number => group.memberIds.length;

/**
 * What this group has spent in one calendar year. [S2, D1]
 *
 * Defaults to the year it is called in, which is the whole of D1's year
 * handling: the strip reads the year at render, and a year nobody has spent in
 * has no bucket and answers zero.
 */
export const spendInYear = (
    group: Group,
    year: string = currentYear(),
): number => group.spendByYear?.[year] ?? 0;

/** True when the given uid owns this group — gates the delete control. [G11] */
export const isOwner = (group: Group, uid: string | undefined): boolean =>
    Boolean(uid) && group.ownerId === uid;

/**
 * Whether `uid` may add a car to this group. [C1]
 *
 * The owner always may; everyone else needs an explicit entry in `canAddCars`,
 * which the owner manages from the members screen. Mirrored by `mayAddCar()`
 * in firestore.rules — this hides the button, that refuses the write.
 */
export const canAddCars = (group: Group, uid: string | undefined): boolean => {
    if (!uid) return false;
    return group.ownerId === uid || group.canAddCars.includes(uid);
};

/**
 * `canAddCars` with one member toggled, ready to write. [C1]
 *
 * The owner is never removed: they hold the right implicitly, and dropping
 * them from the array would only make the stored value disagree with the rule.
 */
export const withCarAdder = (
    group: Group,
    uid: string,
    allowed: boolean,
): string[] => {
    if (uid === group.ownerId) return group.canAddCars;

    const without = group.canAddCars.filter((entry) => entry !== uid);
    return allowed ? [...without, uid] : without;
};

/** A member row for the detail screen, ordered with the owner first. [G2, G9] */
export interface MemberEntry {
    uid: string;
    username: string;
    isOwner: boolean;
    joinedAt: Timestamp | null;
}

const asTimestamp = (value: unknown): Timestamp | null =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as Timestamp).toDate === "function"
        ? (value as Timestamp)
        : null;

export const memberEntries = (group: Group): MemberEntry[] =>
    group.memberIds
        .map((uid) => ({
            uid,
            // Fall back to the uid when `members` is missing an entry, which a
            // hand-authored document easily can be.
            username: group.members[uid]?.username?.trim() || uid,
            isOwner: uid === group.ownerId,
            joinedAt: asTimestamp(group.members[uid]?.joinedAt),
        }))
        .sort((a, b) => {
            if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
            return a.username.localeCompare(b.username);
        });

/** "12 Mar 2026" — a joined date is context, not a precise timestamp. [G9] */
export const formatJoinedAt = (member: MemberEntry): string => {
    if (!member.joinedAt) return "";

    return member.joinedAt.toDate().toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
};

/** The group document with one member dropped, ready to write. [G10] */
export const withoutMember = (group: Group, uid: string) => {
    const members = { ...group.members };
    delete members[uid];

    return {
        memberIds: group.memberIds.filter((id) => id !== uid),
        members,
        // A departing member keeps no car-adding rights; the rules require this
        // for a self-removal and it would be stale data either way.
        canAddCars: group.canAddCars.filter((id) => id !== uid),
    };
};
