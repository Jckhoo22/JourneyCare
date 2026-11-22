import type { User as FirebaseUser } from "firebase/auth";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";

import { db } from "../configurations/firebase-config";
import type { UserDoc } from "../model/User";

/** What the session takes from `users/{uid}`. */
export interface StoredProfile {
    /** null when the profile doesn't exist yet or carries no username. */
    username: string | null;
    /** [P3b] Absent on profiles written before T9; zero stands in. */
    groupsOwned: number;
    /** [T19, I18N2] Absent means "no preference yet" — the app falls back
        to the local cache, which itself defaults to English. */
    language: "en" | "ms" | "zh" | undefined;
}

/**
 * Reads `users/{uid}` once, for the session.
 *
 * Read-only on purpose. Under A6 the username screen is the only writer of the
 * username, so nothing here invents one from a provider display name — a null
 * return is exactly what routes the user to that screen.
 *
 * `groupsOwned` rides along rather than getting its own read: UserContext
 * already fetches this document on every session, and the home screen needs
 * the counter to know whether it has drifted. [P3b]
 */
export const loadProfile = async (
    firebaseUser: FirebaseUser,
): Promise<StoredProfile> => {
    const snapshot = await getDoc(doc(db, "users", firebaseUser.uid));
    if (!snapshot.exists())
        return { username: null, groupsOwned: 0, language: undefined };

    const data = snapshot.data() as UserDoc;
    const username = data.username;

    return {
        username:
            typeof username === "string" && username.trim() ? username : null,
        groupsOwned:
            typeof data.groupsOwned === "number" ? data.groupsOwned : 0,
        language:
            data.language === "en" || data.language === "ms" || data.language === "zh"
                ? data.language
                : undefined,
    };
};

/**
 * Completes the profile from the one-time username screen. [A6]
 *
 * Creates the document with `{username, email, createdAt}` on first entry, or
 * fills in the username on a document that somehow exists without one —
 * preserving the original `createdAt` in that case rather than resetting it.
 */
export const saveUsername = async (
    firebaseUser: FirebaseUser,
    username: string,
): Promise<void> => {
    const ref = doc(db, "users", firebaseUser.uid);
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
        await updateDoc(ref, {
            username,
            email: firebaseUser.email ?? "",
        });
        return;
    }

    const profile: UserDoc = {
        username,
        email: firebaseUser.email ?? "",
        createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
};

/**
 * Firestore's hard ceiling on writes in one batch. The fan-out below chunks to
 * it rather than assuming a family-scale user is in few enough groups.
 */
const BATCH_LIMIT = 500;

/**
 * Changes the display name everywhere it is stored. [SET2, D2]
 *
 * `saveUsername` above is not enough on its own, and that gap was the whole of
 * the "username isn't editable" bug. The name lives in TWO places:
 *
 *   users/{uid}.username                  — the original
 *   groups/{gid}.members[uid].username    — a denormalised copy, one per group
 *
 * The copies exist so a member list costs one read instead of one per member,
 * and they are what every human-visible surface actually renders: the members
 * panel, the access grid, the pending-request rows. Writing only the profile
 * document produced exactly the reported symptom — the field appears to save,
 * the session picks the new name up, and every list still shows the old one.
 *
 * So the rename is a fan-out: the profile, then one `members[uid].username`
 * update per group the user belongs to. The group half is chunked into batches
 * because a batch caps at 500 writes.
 *
 * NOT transactional across the two halves, deliberately. Firestore has no
 * cross-collection transaction that would scale with group count, and the
 * failure mode is benign in a way the alternative isn't: the profile is
 * written FIRST, so a partial run leaves the original correct and some copies
 * stale — the state the app was already in before this function existed, and
 * one that re-saving repairs. Writing the groups first could leave the copies
 * ahead of an original that never changed, which nothing would ever fix.
 *
 * Notifications need no fan-out. They quote the sender's name at send time
 * (`JoinController` reads it from the session), so new ones carry the new name
 * and old ones keep the name that was true when they were sent — which is the
 * correct behaviour for a record of a past event, not a bug.
 */
export const renameUser = async (
    firebaseUser: FirebaseUser,
    username: string,
): Promise<void> => {
    await saveUsername(firebaseUser, username);

    const uid = firebaseUser.uid;
    const groups = await getDocs(
        query(
            collection(db, "groups"),
            where("memberIds", "array-contains", uid),
        ),
    );

    // Dot notation targets the one key inside the map. Replacing the whole
    // `members` object would race any membership change landing at the same
    // moment, and the rules branch that admits this write pins every other
    // key anyway.
    const field = `members.${uid}.username`;

    for (let start = 0; start < groups.docs.length; start += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const group of groups.docs.slice(start, start + BATCH_LIMIT)) {
            batch.update(group.ref, { [field]: username });
        }
        await batch.commit();
    }
};

/**
 * Persists the user's UI language preference to Firestore. [T19, I18N2]
 *
 * Own-doc write — no new rules surface beyond the whitelisted `language`
 * field. Fires exactly once per selection; the local cache handles instant
 * apply, and the doc-writes-are-source-of-truth invariant means the same
 * language follows the user across devices.
 *
 * No fan-out. Unlike the username, the language is a private preference —
 * it doesn't appear in any group document, notification, or per-car map.
 * See `renameUser` above for the fan-out shape that does apply there.
 */
export const saveLanguage = async (
    firebaseUser: FirebaseUser,
    language: "en" | "ms" | "zh",
): Promise<void> => {
    const ref = doc(db, "users", firebaseUser.uid);
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
        await updateDoc(ref, { language });
        return;
    }

    // A pre-username profile shouldn't really exist here — the guards send
    // the user to the username screen first — but if we're called, initialise
    // with a minimum shape rather than throwing.
    await setDoc(ref, {
        username: "",
        email: firebaseUser.email ?? "",
        createdAt: serverTimestamp(),
        language,
    });
};
