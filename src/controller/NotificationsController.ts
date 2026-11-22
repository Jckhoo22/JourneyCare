import { useCallback, useEffect, useState } from "react";
import {
    collection,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
    writeBatch,
} from "firebase/firestore";

import { db } from "../configurations/firebase-config";
import { useToast } from "../context/Toast";
import { useUser } from "../context/UserContext";
import {
    toNotification,
    type AppNotification,
    type NotificationDoc,
} from "../model/Notification";
import {
    getErrorCode,
    getFirebaseErrorMessage,
} from "../utils/firebaseErrorMapper";

/**
 * Ceiling on the badge listener. The badge only ever needs to distinguish
 * counts up to 99, so reading more than this would be pure waste — and an
 * unbounded listener over a user's whole history is exactly the
 * read-amplification trap to avoid. [N2]
 */
const BADGE_LIMIT = 100;

/** One page of the list screen. [N4] */
export const PAGE_SIZE = 25;

/** Firestore's hard cap is 500 writes; stay well clear on Mark all read. */
const MAX_BATCH = 400;

interface Snapshot<T> {
    uid: string;
    items: T[];
}

const mapDocs = (
    docs: Array<{ id: string; data: () => unknown }>,
): AppNotification[] =>
    docs.map((entry) =>
        toNotification(entry.id, entry.data() as Partial<NotificationDoc>),
    );

/** Live unread count for the bell badge. [N2] */
export const useUnreadNotifications = (): {
    unread: AppNotification[];
    count: number;
} => {
    const { user } = useUser();
    const uid = user?.uid;

    const [snapshot, setSnapshot] = useState<Snapshot<AppNotification> | null>(
        null,
    );

    useEffect(() => {
        if (!uid) return;

        const unreadQuery = query(
            collection(db, "notifications", uid, "items"),
            where("read", "==", false),
            limit(BADGE_LIMIT),
        );

        const unsubscribe = onSnapshot(
            unreadQuery,
            (result) => setSnapshot({ uid, items: mapDocs(result.docs) }),
            (error) => {
                console.error("Unread notifications listener error:", error);
                setSnapshot({ uid, items: [] });
            },
        );

        return () => unsubscribe();
    }, [uid]);

    const isCurrent = snapshot !== null && snapshot.uid === uid;
    const unread = isCurrent ? snapshot.items : [];

    return { unread, count: unread.length };
};

/**
 * The notification list, newest first and explicitly bounded. [N4]
 *
 * `loadMore` raises the ceiling a page at a time rather than listening to
 * everything — the listener always has a limit on it.
 */
export const useNotifications = (): {
    items: AppNotification[];
    isLoading: boolean;
    hasMore: boolean;
    loadMore: () => void;
} => {
    const { user } = useUser();
    const uid = user?.uid;

    const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
    const [snapshot, setSnapshot] = useState<Snapshot<AppNotification> | null>(
        null,
    );

    useEffect(() => {
        if (!uid) return;

        const listQuery = query(
            collection(db, "notifications", uid, "items"),
            orderBy("createdAt", "desc"),
            limit(pageLimit),
        );

        const unsubscribe = onSnapshot(
            listQuery,
            (result) => setSnapshot({ uid, items: mapDocs(result.docs) }),
            (error) => {
                console.error("Notifications listener error:", error);
                setSnapshot({ uid, items: [] });
            },
        );

        return () => unsubscribe();
    }, [uid, pageLimit]);

    const isCurrent = snapshot !== null && snapshot.uid === uid;
    const items = isCurrent ? snapshot.items : [];

    return {
        items,
        isLoading: !isCurrent,
        // A full page probably means there's more behind it.
        hasMore: items.length >= pageLimit,
        loadMore: () => setPageLimit((current) => current + PAGE_SIZE),
    };
};

/**
 * Marking read and deleting. [N3]
 *
 * Per item on tap, plus an explicit Mark all read — rather than marking
 * everything the moment the screen opens. Opening a list shouldn't silently
 * discard what you haven't looked at, and this avoids a write on every visit.
 *
 * Deletion is single + batch, both routed through the same writeBatch. The
 * subtree's delete rule is already open (`allow delete: if isOwnSubtree()`,
 * shipped in Phase 1 precisely so a UI could arrive without a rules change),
 * and the badge / list listeners are `onSnapshot`, so any counter or item
 * pruning surfaces automatically — no local mutation needed.
 */
export const useNotificationActions = (): {
    markRead: (item: AppNotification) => Promise<void>;
    markAllRead: (items: AppNotification[]) => Promise<void>;
    deleteNotifications: (items: AppNotification[]) => Promise<void>;
    isBusy: boolean;
} => {
    const { user } = useUser();
    const { addToast } = useToast();
    const uid = user?.uid;

    const [isBusy, setIsBusy] = useState(false);

    const writeRead = useCallback(
        async (items: AppNotification[]) => {
            if (!uid || items.length === 0) return;

            const batch = writeBatch(db);
            items.slice(0, MAX_BATCH).forEach((item) => {
                batch.update(doc(db, "notifications", uid, "items", item.id), {
                    read: true,
                });
            });
            await batch.commit();
        },
        [uid],
    );

    const markRead = useCallback(
        async (item: AppNotification) => {
            if (item.read) return;
            try {
                await writeRead([item]);
            } catch (error: unknown) {
                // Non-fatal: the tap still navigates.
                console.warn("Could not mark notification read:", error);
            }
        },
        [writeRead],
    );

    const markAllRead = useCallback(
        async (items: AppNotification[]) => {
            const unread = items.filter((item) => !item.read);
            if (unread.length === 0) return;

            setIsBusy(true);
            try {
                await writeRead(unread);
            } catch (error: unknown) {
                console.error("Could not mark all read:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
            } finally {
                setIsBusy(false);
            }
        },
        [addToast, writeRead],
    );

    const deleteNotifications = useCallback(
        async (items: AppNotification[]) => {
            if (!uid || items.length === 0) return;

            setIsBusy(true);
            try {
                // Chunk at MAX_BATCH — the list page today caps at PAGE_SIZE
                // (25), well under Firestore's 500-write ceiling, but keeping
                // this safe means a future select-all-and-load-more doesn't
                // silently drop the tail.
                for (let start = 0; start < items.length; start += MAX_BATCH) {
                    const chunk = items.slice(start, start + MAX_BATCH);
                    const batch = writeBatch(db);
                    chunk.forEach((item) => {
                        batch.delete(
                            doc(db, "notifications", uid, "items", item.id),
                        );
                    });
                    await batch.commit();
                }
            } catch (error: unknown) {
                console.error("Could not delete notifications:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
            } finally {
                setIsBusy(false);
            }
        },
        [addToast, uid],
    );

    return { markRead, markAllRead, deleteNotifications, isBusy };
};
