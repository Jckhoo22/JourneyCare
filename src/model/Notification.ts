import { serverTimestamp, type FieldValue, type Timestamp } from "firebase/firestore";

/**
 * Phase 1 notification types. [N1]
 *
 * Per-car access-change notifications arrive with cars in Phase 2 [G8] — they
 * are not built here, and adding one means extending both this union and the
 * `isOwnerDecisionNotice` shape in firestore.rules.
 */
export type NotificationType =
    | "join_request"
    | "request_accepted"
    | "request_declined"
    | "removed_from_group"
    | "group_renamed"
    | "access_changed"
    | "due_soon"
    | "overdue";

/** The whitelist, as data — the rules enforce the same eight. [T15] */
export const NOTIFICATION_TYPES: readonly NotificationType[] = [
    "join_request",
    "request_accepted",
    "request_declined",
    "removed_from_group",
    "group_renamed",
    "access_changed",
    "due_soon",
    "overdue",
];

/**
 * What a notification is when this build doesn't recognise its type. [T15]
 *
 * Not paranoia: a browser tab left open across a deploy is running the OLD
 * bundle, and the moment a future release adds a ninth type that tab will be
 * handed one. The alternatives were both bad — coercing it to `join_request`
 * (which is what this used to do) puts words in someone's mouth, and indexing
 * an icon map with an unknown key throws inside the render. So an unrecognised
 * type stays unrecognised, renders as "something happened in this group", and
 * still opens the group.
 */
export type RenderableType = NotificationType | "unknown";

const isKnownType = (value: unknown): value is NotificationType =>
    typeof value === "string" &&
    (NOTIFICATION_TYPES as readonly string[]).includes(value);

/**
 * Whitelisted in firestore.rules. Two shapes share this type:
 *
 *   the four group-naming types  {groupId, groupName, username?}
 *   group_renamed [G12]          {groupId, oldName, newName, username}
 *
 * They are modelled as one optional-heavy interface rather than a union
 * because `toNotification` reads whatever a document actually holds, and the
 * rules — not the type system — are what guarantee the shape. Nothing else may
 * be written, which is what stops these documents carrying free-form text.
 */
export interface NotificationPayload {
    groupId: string;
    /** The four group-naming types. Absent on group_renamed. */
    groupName?: string;
    username?: string;
    /** group_renamed only. [G12] */
    oldName?: string;
    /** group_renamed only. [G12] */
    newName?: string;
    /** access_changed, due_soon, overdue — the car's display name. [N6, R4] */
    carName?: string;
    /** access_changed only — true when edit was granted, false when revoked. [N6] */
    granted?: boolean;
    /**
     * access_changed, due_soon, overdue — which car, so tapping opens it.
     * [N6, R4]
     *
     * access_changed carries it as of T15. Without it, "You can now edit Mum's
     * Myvi" could only drop you on the group page to go find Mum's Myvi — a
     * notification that names one thing should open that thing.
     */
    carId?: string;
    /** due_soon / overdue — which service. [R4] */
    typeLabel?: string;
    /** due_soon / overdue — "Due by 15 Aug 2026 or at 52,000 km". [R4] */
    dueLabel?: string;
    /**
     * due_soon / overdue — raw due date, milliseconds since epoch. [T19, I18N5]
     *
     * Optional companion to `dueLabel`. Present on notifications written by
     * T19 onward so the render can format the date in the READER's locale.
     * Old notifications lack this and fall back to the point-in-time
     * dueLabel string exactly as before. See NotificationsPage's due
     * formatter.
     */
    dueDateMs?: number;
    /** due_soon / overdue — raw due kilometre reading. [T19, I18N5] */
    dueKm?: number;
}

export interface NotificationDoc {
    type: NotificationType;
    payload: NotificationPayload;
    read: boolean;
    createdAt: Timestamp | FieldValue;
}

export interface AppNotification {
    id: string;
    type: RenderableType;
    payload: NotificationPayload;
    read: boolean;
    createdAt: Timestamp | null;
}

const isTimestamp = (value: unknown): value is Timestamp =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as Timestamp).toDate === "function";

export const toNotification = (
    id: string,
    data: Partial<NotificationDoc>,
): AppNotification => ({
    id,
    // An unrecognised type stays unrecognised. See RenderableType.
    type: isKnownType(data.type) ? data.type : "unknown",
    payload: {
        groupId: data.payload?.groupId ?? "",
        // "a group" only stands in for the types that carry a name at all;
        // group_renamed has oldName/newName instead and must not be given a
        // fake groupName it would then render. [G12]
        groupName:
            data.type === "group_renamed"
                ? undefined
                : data.payload?.groupName?.trim() || "a group",
        username: data.payload?.username?.trim() || undefined,
        oldName: data.payload?.oldName?.trim() || undefined,
        newName: data.payload?.newName?.trim() || undefined,
        carName: data.payload?.carName?.trim() || undefined,
        carId: data.payload?.carId?.trim() || undefined,
        typeLabel: data.payload?.typeLabel?.trim() || undefined,
        dueLabel: data.payload?.dueLabel?.trim() || undefined,
        dueDateMs:
            typeof data.payload?.dueDateMs === "number"
                ? data.payload.dueDateMs
                : undefined,
        dueKm:
            typeof data.payload?.dueKm === "number"
                ? data.payload.dueKm
                : undefined,
        granted:
            typeof data.payload?.granted === "boolean"
                ? data.payload.granted
                : undefined,
    },
    read: data.read === true,
    createdAt: isTimestamp(data.createdAt) ? data.createdAt : null,
});

/**
 * Someone asking to join, addressed to the group's owner. [G5, N1]
 * `groupName` must equal the group's real name or the rules refuse it.
 */
export const joinRequestNotification = (
    groupId: string,
    groupName: string,
    username: string,
): NotificationDoc => ({
    type: "join_request",
    payload: { groupId, groupName, username },
    read: false,
    createdAt: serverTimestamp(),
});

/**
 * An owner's decision, addressed to the person it concerns. [G7, G10, N1]
 * Deliberately carries no `username` — the payload whitelist allows it, but
 * there is nobody to name.
 */
export const decisionNotification = (
    type: "request_accepted" | "request_declined" | "removed_from_group",
    groupId: string,
    groupName: string,
): NotificationDoc => ({
    type,
    payload: { groupId, groupName },
    read: false,
    createdAt: serverTimestamp(),
});

/**
 * The owner renamed the group, addressed to a member. [G12]
 *
 * `oldName` must equal the group's name as it stands BEFORE the batch commits
 * — the rules validate it against exactly that, since `get()` sees pre-batch
 * state. Pass the name the group had when the rename started, not the new one.
 */
export const renameNotification = (
    groupId: string,
    oldName: string,
    newName: string,
    username: string,
): NotificationDoc => ({
    type: "group_renamed",
    payload: { groupId, oldName, newName, username },
    read: false,
    createdAt: serverTimestamp(),
});

/**
 * The owner changed a member's edit access to a car. [N6, C6]
 *
 * Written in the same batch as the access-map update, so a member is never
 * silently granted or quietly stripped. `granted` carries the direction rather
 * than there being two notification types — the wording differs, the shape
 * doesn't.
 *
 * `carName` is the display name at the time (nickname, or make + model). Like
 * every other notification payload it is point-in-time: renaming the car later
 * does not rewrite what someone was already told.
 */
export const accessChangedNotification = (
    groupId: string,
    groupName: string,
    carId: string,
    carName: string,
    granted: boolean,
): NotificationDoc => ({
    type: "access_changed",
    payload: { groupId, groupName, carId, carName, granted },
    read: false,
    createdAt: serverTimestamp(),
});

/**
 * A service crossing into due-soon or overdue. [R4]
 *
 * Written client-side when a render detects the transition, in the same batch
 * as the car's `statusStamp` — the stamp is what stops it firing again on the
 * next app open.
 *
 * `dueLabel` is a pre-formatted string rather than raw dates: the notification
 * is point-in-time like every other, and re-deriving "due by" later from an
 * interval that has since been edited would make an old message say something
 * that was never true.
 */
export const dueNotification = (
    type: "due_soon" | "overdue",
    groupId: string,
    groupName: string,
    carId: string,
    carName: string,
    typeLabel: string,
    dueLabel: string,
    raw?: { dueDateMs?: number; dueKm?: number },
): NotificationDoc => ({
    type,
    payload: {
        groupId,
        groupName,
        carId,
        carName,
        typeLabel,
        dueLabel,
        ...(raw?.dueDateMs !== undefined ? { dueDateMs: raw.dueDateMs } : {}),
        ...(raw?.dueKm !== undefined ? { dueKm: raw.dueKm } : {}),
    },
    read: false,
    createdAt: serverTimestamp(),
});

/** "12 Mar, 14:05" */
export const formatNotifiedAt = (item: AppNotification): string => {
    if (!item.createdAt) return "";

    return item.createdAt.toDate().toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
};

/** Exact to 99, then "99+". [N2] */
export const formatUnreadBadge = (count: number): string =>
    count > 99 ? "99+" : String(count);
