import { useCallback, useEffect, useState } from "react";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    where,
    writeBatch,
} from "firebase/firestore";

import { db } from "../configurations/firebase-config";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/Toast";
import { useUser } from "../context/UserContext";
import { toGroup, type Group, type GroupDoc } from "../model/Group";
import {
    toJoinRequest,
    type JoinRequest,
    type JoinRequestDoc,
} from "../model/JoinRequest";
import {
    decisionNotification,
    joinRequestNotification,
} from "../model/Notification";
import {
    getErrorCode,
    getFirebaseErrorMessage,
} from "../utils/firebaseErrorMapper";

/**
 * What a `/join/...` link resolved to. [G5]
 *
 * Each value gets its own message. There is deliberately no "expired" — join
 * tokens never expire (G3), and reporting expiry would be a lie that hides the
 * real cause.
 */
export type InviteState =
    | "loading"
    /** Token accepted so far as we can tell; the rules decide on submit. */
    | "valid"
    /** The URL itself is malformed — missing or implausible parts. */
    | "invalid-link"
    /** No such group, or it has been deleted. */
    | "group-missing"
    | "already-member"
    | "already-pending"
    /** The rules refused the request — wrong token, or the group went away. */
    | "rejected"
    /** Something else went wrong; the message names it as a permission problem. */
    | "error";

interface UseInviteResult {
    state: InviteState;
    /** The group's display name, from the public window. */
    groupName: string;
    /** Sends the request. Resolves true when one was created. */
    requestToJoin: () => Promise<boolean>;
    isSubmitting: boolean;
}

/** Mirrors the 20-character floor the rules enforce on joinToken. */
const MIN_TOKEN_LENGTH = 20;

/**
 * The group owner's uid, from the public window. [N1]
 *
 * The one field a non-member can read that says who to notify. Resolves to ""
 * rather than throwing: a missing owner must not take the join request down
 * with it.
 */
const readPublicOwnerId = async (groupId: string): Promise<string> => {
    try {
        const snapshot = await getDoc(doc(db, "groups", groupId, "public", "info"));
        return snapshot.exists()
            ? ((snapshot.data() as { ownerId?: string }).ownerId ?? "")
            : "";
    } catch (error: unknown) {
        console.warn("Could not read group owner for notification:", error);
        return "";
    }
};

/**
 * Resolves an invite link and, if it checks out, lets the visitor ask to join.
 *
 * Reads only what an invited stranger is actually allowed to read. An earlier
 * version read `groups/{id}` to get the name and check the token — but that
 * document is members-only (S1), so every genuine invite died with
 * permission-denied and was reported as an invalid link.
 *
 * The sequence now:
 *   1. Probe `groups/{id}`. Succeeding *is* the membership test — only members
 *      can read it, so a success means "already in".
 *   2. Otherwise read `groups/{id}/public/info` for the display name.
 *   3. Check for an outstanding request of our own.
 *
 * The token is deliberately NOT checked here: only the create rule can compare
 * it, via a get() that client read rules don't constrain. So a wrong token
 * surfaces when the request is submitted, as `rejected`.
 */
export const useInvite = (
    groupId: string | undefined,
    token: string | undefined,
): UseInviteResult => {
    const { user } = useUser();
    const { addToast } = useToast();
    const { locale } = useLanguage();

    const uid = user?.uid;
    const username = user?.username ?? "";

    const [state, setState] = useState<InviteState>("loading");
    const [groupName, setGroupName] = useState("");
    // Needed to address the owner's notification — the group document itself is
    // unreadable to a non-member, so this comes from the public window. [N1]
    const [ownerId, setOwnerId] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // A pure function of the URL, so derived rather than stored — no effect
    // needs to run to know the link is truncated.
    const linkIsWellFormed = Boolean(
        groupId && token && token.length >= MIN_TOKEN_LENGTH,
    );

    useEffect(() => {
        if (!uid || !groupId || !linkIsWellFormed) return;

        let cancelled = false;

        const resolve = async () => {
            // Step 1 — membership probe. Only members may read the group doc,
            // so a denial here is expected and means nothing more than
            // "not a member yet".
            try {
                const groupSnapshot = await getDoc(doc(db, "groups", groupId));
                if (cancelled) return;

                if (groupSnapshot.exists()) {
                    const found = toGroup(
                        groupSnapshot.id,
                        groupSnapshot.data() as Partial<GroupDoc>,
                    );
                    if (found.memberIds.includes(uid)) {
                        setGroupName(found.name);
                        setState("already-member");
                        return;
                    }
                }
            } catch {
                // Denied — carry on as a non-member.
            }

            try {
                // Step 2 — the public window: name only, readable by any
                // signed-in user who has the group's id.
                const infoSnapshot = await getDoc(
                    doc(db, "groups", groupId, "public", "info"),
                );
                if (cancelled) return;

                if (!infoSnapshot.exists()) {
                    setState("group-missing");
                    return;
                }
                const info = infoSnapshot.data() as {
                    name?: string;
                    ownerId?: string;
                };
                // The rules require groupName to equal the group's real name,
                // so this value is passed through untouched when notifying.
                setGroupName(info.name?.trim() || "this group");
                setOwnerId(info.ownerId ?? "");

                // Step 3 — one outstanding ask at a time.
                const existing = await getDocs(
                    query(
                        collection(db, "joinRequests"),
                        where("uid", "==", uid),
                        where("groupId", "==", groupId),
                        where("status", "==", "pending"),
                    ),
                );
                if (cancelled) return;

                setState(existing.empty ? "valid" : "already-pending");
            } catch (error: unknown) {
                if (cancelled) return;
                console.error("Invite resolution failed:", error);
                setState("error");
            }
        };

        void resolve();
        return () => {
            cancelled = true;
        };
    }, [groupId, linkIsWellFormed, uid]);

    const requestToJoin = useCallback(async (): Promise<boolean> => {
        if (!groupId || !token || !uid) return false;

        setIsSubmitting(true);
        try {
            const payload: JoinRequestDoc = {
                groupId,
                token,
                uid,
                username,
                status: "pending",
                createdAt: serverTimestamp(),
            };

            // Who to tell. Normally this arrived with the invite resolution
            // above; re-read it here when it didn't, because the alternative is
            // posting a request that no owner is ever notified about — which is
            // indistinguishable, from the joiner's side, from it having worked.
            // That silent skip is what made join notifications look broken. [N1]
            const notifyUid = ownerId || (await readPublicOwnerId(groupId));

            // One batch: the request and the owner's notification land
            // together, so the owner is never left unaware of it. [N1]
            const batch = writeBatch(db);
            batch.set(doc(collection(db, "joinRequests")), payload);

            if (notifyUid) {
                batch.set(
                    doc(collection(db, "notifications", notifyUid, "items")),
                    joinRequestNotification(groupId, groupName, username),
                );
            } else {
                // Still send the request — a joinable group the owner has to
                // find manually beats no request at all — but never quietly.
                // The owner's Invite screen repairs the missing ownerId via
                // ensurePublicInfo the next time they open it.
                console.error(
                    `Join request for group ${groupId} sent with no owner notification: ` +
                        "groups/{id}/public/info has no ownerId. The owner should open " +
                        "the group's Invitation screen once to repair it.",
                );
            }

            await batch.commit();

            setState("already-pending");
            addToast(locale.join.requestSent, "success");
            return true;
        } catch (error: unknown) {
            console.error("Join request failed:", error);

            // This is where a wrong token lands: the create rule compares it
            // against the group and refuses. Say that, rather than inventing an
            // expiry that this system does not have. [G3]
            if (getErrorCode(error) === "permission-denied") {
                setState("rejected");
            } else {
                setState("error");
            }
            return false;
        } finally {
            setIsSubmitting(false);
        }
    }, [addToast, groupId, groupName, locale, ownerId, token, uid, username]);

    return {
        state: linkIsWellFormed ? state : "invalid-link",
        groupName,
        requestToJoin,
        isSubmitting,
    };
};

interface PendingSnapshot {
    groupId: string;
    requests: JoinRequest[];
}

/** The owner's live list of pending requests for one group. [G6] */
export const usePendingRequests = (
    groupId: string | undefined,
    enabled: boolean,
): { requests: JoinRequest[]; isLoading: boolean } => {
    const [snapshot, setSnapshot] = useState<PendingSnapshot | null>(null);

    useEffect(() => {
        if (!groupId || !enabled) return;

        const pendingQuery = query(
            collection(db, "joinRequests"),
            where("groupId", "==", groupId),
            where("status", "==", "pending"),
        );

        const unsubscribe = onSnapshot(
            pendingQuery,
            (result) => {
                setSnapshot({
                    groupId,
                    requests: result.docs.map((entry) =>
                        toJoinRequest(
                            entry.id,
                            entry.data() as Partial<JoinRequestDoc>,
                        ),
                    ),
                });
            },
            (error) => {
                console.error("Pending requests listener error:", error);
                setSnapshot({ groupId, requests: [] });
            },
        );

        return () => unsubscribe();
    }, [groupId, enabled]);

    const isCurrent = snapshot !== null && snapshot.groupId === groupId;

    return {
        requests: isCurrent ? snapshot.requests : [],
        isLoading: enabled && !isCurrent,
    };
};

interface UseRequestDecisionsResult {
    accept: (group: Group, request: JoinRequest) => Promise<boolean>;
    /** Takes the group so the notification can carry its real name. [N1] */
    decline: (group: Group, request: JoinRequest) => Promise<boolean>;
    busyRequestId: string | null;
}

/** Owner-side accept / decline. [G7] */
export const useRequestDecisions = (): UseRequestDecisionsResult => {
    const { addToast } = useToast();
    const { locale } = useLanguage();

    const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

    /**
     * One batched write: the uid joins `memberIds` and `members`, and the
     * request is marked accepted — atomically, so the two can never disagree.
     *
     * The shape here is dictated by the rules: exactly one uid added, `members`
     * kept in step, and name / joinToken / ownerId untouched.
     */
    const accept = useCallback(
        async (group: Group, request: JoinRequest): Promise<boolean> => {
            setBusyRequestId(request.id);
            try {
                const batch = writeBatch(db);

                batch.update(doc(db, "groups", group.id), {
                    memberIds: [...group.memberIds, request.uid],
                    members: {
                        ...group.members,
                        [request.uid]: {
                            username: request.username,
                            joinedAt: serverTimestamp(),
                        },
                    },
                });
                batch.update(doc(db, "joinRequests", request.id), {
                    status: "accepted",
                });

                // Same batch as the membership change. [N1]
                batch.set(
                    doc(collection(db, "notifications", request.uid, "items")),
                    decisionNotification(
                        "request_accepted",
                        group.id,
                        group.name,
                    ),
                );

                await batch.commit();
                addToast(
                    locale.join.accepted.replace("{name}", request.username),
                    "success",
                );
                return true;
            } catch (error: unknown) {
                console.error("Accept failed:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setBusyRequestId(null);
            }
        },
        [addToast, locale],
    );

    const decline = useCallback(
        async (group: Group, request: JoinRequest): Promise<boolean> => {
            setBusyRequestId(request.id);
            try {
                const batch = writeBatch(db);
                batch.update(doc(db, "joinRequests", request.id), {
                    status: "declined",
                });

                // Same batch, so a decline is never silent. [N1]
                batch.set(
                    doc(collection(db, "notifications", request.uid, "items")),
                    decisionNotification(
                        "request_declined",
                        group.id,
                        group.name,
                    ),
                );

                await batch.commit();

                addToast(locale.join.declined, "info");
                return true;
            } catch (error: unknown) {
                console.error("Decline failed:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setBusyRequestId(null);
            }
        },
        [addToast, locale],
    );

    return { accept, decline, busyRequestId };
};
