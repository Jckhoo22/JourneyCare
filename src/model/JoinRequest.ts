import type { FieldValue, Timestamp } from "firebase/firestore";

export type JoinRequestStatus = "pending" | "accepted" | "declined";

/**
 * Shape of a `joinRequests/{requestId}` document. [G5]
 *
 * `token` is not in plan.md's field list. It has to be written because S2's
 * create rule compares the presented token against the group's `joinToken`, and
 * rules can only see fields that exist on the document. Both parties who can
 * read this doc already know the token.
 */
export interface JoinRequestDoc {
    groupId: string;
    token: string;
    uid: string;
    username: string;
    status: JoinRequestStatus;
    createdAt: Timestamp | FieldValue;
}

export interface JoinRequest extends Omit<JoinRequestDoc, "createdAt"> {
    id: string;
    createdAt: Timestamp | null;
}

const isTimestamp = (value: unknown): value is Timestamp =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as Timestamp).toDate === "function";

/** Reads a request snapshot defensively — same reasoning as toGroup. */
export const toJoinRequest = (
    id: string,
    data: Partial<JoinRequestDoc>,
): JoinRequest => ({
    id,
    groupId: data.groupId ?? "",
    token: data.token ?? "",
    uid: data.uid ?? "",
    username: data.username?.trim() || "Someone",
    status: (data.status as JoinRequestStatus) ?? "pending",
    createdAt: isTimestamp(data.createdAt) ? data.createdAt : null,
});

/** "12 Mar, 14:05" — enough for an owner to tell two requests apart. */
export const formatRequestedAt = (request: JoinRequest): string => {
    if (!request.createdAt) return "";

    return request.createdAt.toDate().toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
};
