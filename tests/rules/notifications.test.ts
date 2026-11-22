import { readFileSync } from "node:fs";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Security-rules tests for notifications. [N5]
 *
 * The property under test: your notification subtree is yours, and the only way
 * into someone else's is one of three group-anchored shapes. It must not be
 * usable as a messaging or spam channel.
 */

const OWNER = "owner-uid";
const JOINER = "joiner-uid";
const MEMBER = "member-uid";
const STRANGER = "stranger-uid";

const GROUP_ID = "family-car";
const GROUP_NAME = "Family Car";
const TOKEN = "0123456789abcdef0123456789abcdef";
/** access_changed points at a car as of T15, so one has to exist. */
const CAR_ID = "myvi";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare-notifications",
        firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
});

afterAll(async () => {
    await testEnv?.cleanup();
});

beforeEach(async () => {
    await testEnv.clearFirestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        // OWNER owns the group; MEMBER is in it; JOINER and STRANGER are not.
        await setDoc(doc(db, "groups", GROUP_ID), {
            name: GROUP_NAME,
            ownerId: OWNER,
            memberIds: [OWNER, MEMBER],
            members: {
                [OWNER]: { username: "Owner", joinedAt: new Date() },
                [MEMBER]: { username: "Member", joinedAt: new Date() },
            },
            canAddCars: [OWNER],
            joinToken: TOKEN,
            createdAt: new Date(),
        });

        await setDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
            brand: "Perodua",
            model: "Myvi",
            year: 2018,
            nickname: "Mum's Myvi",
            access: {},
            lastByType: {},
            statusStamp: {},
            totalSpend: 0,
            createdBy: OWNER,
            createdAt: new Date(),
        });
    });
});

const notification = (
    type: string,
    overrides: Record<string, unknown> = {},
    payloadOverrides: Record<string, unknown> = {},
) => ({
    type,
    payload: {
        groupId: GROUP_ID,
        groupName: GROUP_NAME,
        ...payloadOverrides,
    },
    read: false,
    createdAt: serverTimestamp(),
    ...overrides,
});

const seedNotification = async (uid: string, id: string) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
            doc(context.firestore(), "notifications", uid, "items", id),
            {
                type: "join_request",
                payload: {
                    groupId: GROUP_ID,
                    groupName: GROUP_NAME,
                    username: "Joiner",
                },
                read: false,
                createdAt: new Date(),
            },
        );
    });
};

// ------------------------------------------------------------ OWN SUBTREE

describe("your own subtree", () => {
    it("lets you read your own notifications", async () => {
        await seedNotification(OWNER, "n1");
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            getDoc(doc(owner, "notifications", OWNER, "items", "n1")),
        );
    });

    it("lets you list your own unread items", async () => {
        await seedNotification(OWNER, "n1");
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        const result = await assertSucceeds(
            getDocs(
                query(
                    collection(owner, "notifications", OWNER, "items"),
                    where("read", "==", false),
                ),
            ),
        );
        expect(result.size).toBe(1);
    });

    it("lets you mark your own notification read", async () => {
        await seedNotification(OWNER, "n1");
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            updateDoc(doc(owner, "notifications", OWNER, "items", "n1"), {
                read: true,
            }),
        );
    });

    it("lets you delete your own notification", async () => {
        await seedNotification(OWNER, "n1");
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            (async () => {
                const { deleteDoc } = await import("firebase/firestore");
                return deleteDoc(doc(owner, "notifications", OWNER, "items", "n1"));
            })(),
        );
    });

    it("STOPS you rewriting the text of a delivered notification", async () => {
        await seedNotification(OWNER, "n1");
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        // `read` is the only field that may ever change.
        await assertFails(
            updateDoc(doc(owner, "notifications", OWNER, "items", "n1"), {
                read: true,
                payload: {
                    groupId: GROUP_ID,
                    groupName: "Something else",
                    username: "Someone else",
                },
            }),
        );
        await assertFails(
            updateDoc(doc(owner, "notifications", OWNER, "items", "n1"), {
                type: "request_accepted",
            }),
        );
    });
});

// --------------------------------------------------------- OTHER SUBTREES

describe("ATTACK: reading someone else's notifications", () => {
    it("STOPS reading another user's item", async () => {
        await seedNotification(OWNER, "n1");
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            getDoc(doc(stranger, "notifications", OWNER, "items", "n1")),
        );
    });

    it("STOPS listing another user's subtree", async () => {
        await seedNotification(OWNER, "n1");
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            getDocs(collection(stranger, "notifications", OWNER, "items")),
        );
    });

    it("STOPS a group member reading the owner's notifications", async () => {
        await seedNotification(OWNER, "n1");
        const member = testEnv.authenticatedContext(MEMBER).firestore();

        // Sharing a group grants nothing here.
        await assertFails(
            getDoc(doc(member, "notifications", OWNER, "items", "n1")),
        );
    });

    it("STOPS marking someone else's notification read", async () => {
        await seedNotification(OWNER, "n1");
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            updateDoc(doc(stranger, "notifications", OWNER, "items", "n1"), {
                read: true,
            }),
        );
    });
});

describe("ATTACK: notifications as a spam channel", () => {
    it("STOPS an arbitrary notification into another user's subtree", async () => {
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            setDoc(
                doc(stranger, "notifications", MEMBER, "items", "spam"),
                notification("hello_there"),
            ),
        );
    });

    it("STOPS extra payload fields carrying a message", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "notifications", OWNER, "items", "spam"),
                notification("join_request", {}, {
                    username: "Joiner",
                    message: "click http://evil.example",
                }),
            ),
        );
    });

    it("STOPS extra top-level fields", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "notifications", OWNER, "items", "spam"),
                notification("join_request", { url: "http://evil.example" }, {
                    username: "Joiner",
                }),
            ),
        );
    });

    it("STOPS a notification that claims a fake group name", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "notifications", OWNER, "items", "spam"),
                notification("join_request", {}, {
                    groupName: "URGENT: verify your account",
                    username: "Joiner",
                }),
            ),
        );
    });

    it("STOPS a wall of text in the username", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "notifications", OWNER, "items", "spam"),
                notification("join_request", {}, { username: "x".repeat(200) }),
            ),
        );
    });

    it("STOPS a notification arriving pre-read", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "notifications", OWNER, "items", "sneaky"),
                notification("join_request", { read: true }, {
                    username: "Joiner",
                }),
            ),
        );
    });

    it("STOPS a join_request notice aimed at someone who isn't the owner", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "notifications", MEMBER, "items", "misaimed"),
                notification("join_request", {}, { username: "Joiner" }),
            ),
        );
    });

    it("STOPS an existing member sending a join_request notice", async () => {
        const member = testEnv.authenticatedContext(MEMBER).firestore();

        await assertFails(
            setDoc(
                doc(member, "notifications", OWNER, "items", "pointless"),
                notification("join_request", {}, { username: "Member" }),
            ),
        );
    });

    it("STOPS a non-owner announcing a decision", async () => {
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            setDoc(
                doc(stranger, "notifications", JOINER, "items", "fake"),
                notification("request_accepted"),
            ),
        );
    });

    it("STOPS an owner faking an acceptance for an existing member", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        // MEMBER is already in the group, so "you were accepted" is incoherent.
        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "incoherent"),
                notification("request_accepted"),
            ),
        );
    });

    it("STOPS an owner claiming removal of someone who isn't a member", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", STRANGER, "items", "incoherent"),
                notification("removed_from_group"),
            ),
        );
    });

    it("STOPS a notification about a group that doesn't exist", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "notifications", OWNER, "items", "ghost"),
                notification("join_request", {}, {
                    groupId: "no-such-group",
                    username: "Joiner",
                }),
            ),
        );
    });

    it("STOPS an unauthenticated visitor creating anything", async () => {
        const anon = testEnv.unauthenticatedContext().firestore();

        await assertFails(
            setDoc(
                doc(anon, "notifications", OWNER, "items", "anon"),
                notification("join_request", {}, { username: "Anon" }),
            ),
        );
    });
});

// ---------------------------------------------- END-TO-END: WRITE THEN READ
//
// The existing tests prove create works and read works, but never that a
// notification written by one user is then *visible to the recipient through
// the exact query the badge uses*. That gap is where "notifications don't
// appear" could hide.

describe("a written notification is actually visible to its recipient", () => {
    it("owner sees the join_request through the badge query", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        // Exactly what requestToJoin does.
        const batch = writeBatch(joiner);
        batch.set(doc(joiner, "joinRequests", "req-1"), {
            groupId: GROUP_ID,
            token: TOKEN,
            uid: JOINER,
            username: "Joiner",
            status: "pending",
            createdAt: serverTimestamp(),
        });
        batch.set(
            doc(joiner, "notifications", OWNER, "items", "n1"),
            notification("join_request", {}, { username: "Joiner" }),
        );
        await assertSucceeds(batch.commit());

        // Exactly what useUnreadNotifications does.
        const owner = testEnv.authenticatedContext(OWNER).firestore();
        const unread = await assertSucceeds(
            getDocs(
                query(
                    collection(owner, "notifications", OWNER, "items"),
                    where("read", "==", false),
                ),
            ),
        );
        expect(unread.size).toBe(1);
        expect(unread.docs[0].data().type).toBe("join_request");
    });

    it("requester sees the acceptance through the badge query", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            setDoc(
                doc(owner, "notifications", JOINER, "items", "n1"),
                notification("request_accepted"),
            ),
        );

        const joiner = testEnv.authenticatedContext(JOINER).firestore();
        const unread = await assertSucceeds(
            getDocs(
                query(
                    collection(joiner, "notifications", JOINER, "items"),
                    where("read", "==", false),
                ),
            ),
        );
        expect(unread.size).toBe(1);
    });

    it("the list query (orderBy createdAt) returns it too", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();
        await assertSucceeds(
            setDoc(
                doc(joiner, "notifications", OWNER, "items", "n1"),
                notification("join_request", {}, { username: "Joiner" }),
            ),
        );

        // A serverTimestamp() resolves on the server, so orderBy must see it.
        const owner = testEnv.authenticatedContext(OWNER).firestore();
        const listed = await assertSucceeds(
            getDocs(
                query(
                    collection(owner, "notifications", OWNER, "items"),
                    orderBy("createdAt", "desc"),
                ),
            ),
        );
        expect(listed.size).toBe(1);
    });
});

// ------------------------------------------------------------ GROUP RENAMED

/**
 * `group_renamed`. [G12]
 *
 * Its own payload shape — the only notification that names something other than
 * the group's current name. The properties: only the owner writes it, only to
 * members, never to themselves, and `oldName` must be the name the group
 * actually had.
 */
describe("group_renamed [G12]", () => {
    const renameNotice = (overrides: Record<string, unknown> = {}) => ({
        type: "group_renamed",
        payload: {
            groupId: GROUP_ID,
            oldName: GROUP_NAME,
            newName: "Family Cars",
            username: "Owner",
            ...overrides,
        },
        read: false,
        createdAt: serverTimestamp(),
    });

    it("lets the owner tell a member", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "n1"),
                renameNotice(),
            ),
        );
    });

    /**
     * The real batch: the rename and every member's notification commit
     * together. Note `oldName` is the name the group STILL has while the rules
     * run — get() sees pre-batch state, which is exactly what makes it
     * checkable.
     */
    it("commits with the rename itself, in one batch", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        const batch = writeBatch(owner);
        batch.update(doc(owner, "groups", GROUP_ID), { name: "Family Cars" });
        batch.set(
            doc(owner, "notifications", MEMBER, "items", "n1"),
            renameNotice(),
        );

        await assertSucceeds(batch.commit());
    });

    it("STOPS a member announcing a rename they didn't make", async () => {
        const member = testEnv.authenticatedContext(MEMBER).firestore();

        // The forgery case: a member writing into another member's subtree.
        await assertFails(
            setDoc(
                doc(member, "notifications", OWNER, "items", "forged"),
                renameNotice({ username: "Member" }),
            ),
        );
    });

    it("STOPS a stranger announcing a rename", async () => {
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            setDoc(
                doc(stranger, "notifications", MEMBER, "items", "forged"),
                renameNotice(),
            ),
        );
    });

    // The renamer already knows. Telling them is noise, and the rule says so
    // rather than trusting the client to filter.
    it("STOPS the owner notifying themselves", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", OWNER, "items", "self"),
                renameNotice(),
            ),
        );
    });

    it("STOPS telling someone who isn't in the group", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", STRANGER, "items", "outsider"),
                renameNotice(),
            ),
        );
    });

    // oldName is the one name that CAN be verified, so it must be.
    it("STOPS an oldName the group never had", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "lie"),
                renameNotice({ oldName: "Something Else Entirely" }),
            ),
        );
    });

    it("STOPS an empty or oversized newName", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "empty"),
                renameNotice({ newName: "" }),
            ),
        );
        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "huge"),
                renameNotice({ newName: "x".repeat(51) }),
            ),
        );
    });

    it("STOPS extra payload fields riding along", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "spam"),
                renameNotice({ message: "click http://evil.example" }),
            ),
        );
    });

    // The two shapes must not be mixable: a rename payload on another type, or
    // a naming payload on a rename, are both refusals.
    it("STOPS mixing the rename payload with another type", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(doc(owner, "notifications", MEMBER, "items", "mixed"), {
                type: "request_accepted",
                payload: {
                    groupId: GROUP_ID,
                    oldName: GROUP_NAME,
                    newName: "Family Cars",
                    username: "Owner",
                },
                read: false,
                createdAt: serverTimestamp(),
            }),
        );
    });

    it("STOPS a rename notice carrying the old naming payload", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(doc(owner, "notifications", MEMBER, "items", "mixed2"), {
                type: "group_renamed",
                payload: { groupId: GROUP_ID, groupName: GROUP_NAME },
                read: false,
                createdAt: serverTimestamp(),
            }),
        );
    });

    it("STOPS a rename notice arriving pre-read", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(doc(owner, "notifications", MEMBER, "items", "sneaky"), {
                ...renameNotice(),
                read: true,
            }),
        );
    });

    it("the recipient sees it through the badge query", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();
        await assertSucceeds(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "n1"),
                renameNotice(),
            ),
        );

        const member = testEnv.authenticatedContext(MEMBER).firestore();
        const unread = await assertSucceeds(
            getDocs(
                query(
                    collection(member, "notifications", MEMBER, "items"),
                    where("read", "==", false),
                ),
            ),
        );
        expect(unread.size).toBe(1);
        expect(unread.docs[0].data().payload.newName).toBe("Family Cars");
    });
});

// ------------------------------------------------------------ ACCESS CHANGED

/**
 * `access_changed`. [N6, C6]
 *
 * The owner telling a member their edit access to a car moved. Only the owner
 * grants or revokes, so only the owner announces — and never to themselves,
 * whose access is implicit.
 */
describe("access_changed [N6]", () => {
    const accessNotice = (overrides: Record<string, unknown> = {}) => ({
        type: "access_changed",
        payload: {
            groupId: GROUP_ID,
            groupName: GROUP_NAME,
            // T15: the notification names one car, so it points at that car.
            carId: CAR_ID,
            carName: "Mum's Myvi",
            granted: true,
            ...overrides,
        },
        read: false,
        createdAt: serverTimestamp(),
    });

    it("lets the owner tell a member their access was granted", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "n1"),
                accessNotice(),
            ),
        );
    });

    it("carries a revoke just as well — one type, two wordings", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "n2"),
                accessNotice({ granted: false }),
            ),
        );
    });

    it("STOPS a member announcing an access change", async () => {
        const member = testEnv.authenticatedContext(MEMBER).firestore();

        // The forgery case: only the owner can move access, so only the owner
        // can claim it moved.
        await assertFails(
            setDoc(
                doc(member, "notifications", OWNER, "items", "forged"),
                accessNotice(),
            ),
        );
    });

    it("STOPS a stranger announcing one", async () => {
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            setDoc(
                doc(stranger, "notifications", MEMBER, "items", "forged"),
                accessNotice(),
            ),
        );
    });

    it("STOPS the owner notifying themselves", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        // Their access is implicit; there is nothing to tell them about.
        await assertFails(
            setDoc(
                doc(owner, "notifications", OWNER, "items", "self"),
                accessNotice(),
            ),
        );
    });

    it("STOPS telling someone outside the group", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", STRANGER, "items", "outsider"),
                accessNotice(),
            ),
        );
    });

    it("STOPS a group name the group doesn't have", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "lie"),
                accessNotice({ groupName: "URGENT: verify your account" }),
            ),
        );
    });

    it("STOPS an empty or oversized car name", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "empty"),
                accessNotice({ carName: "" }),
            ),
        );
        // 81 is the longest carDisplayName can produce; anything past it is
        // someone using the field as a message channel.
        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "huge"),
                accessNotice({ carName: "x".repeat(82) }),
            ),
        );
    });

    it("STOPS a non-boolean direction", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        // `granted` decides the wording; a string here would render as truthy
        // and always say "granted".
        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "fuzzy"),
                accessNotice({ granted: "yes" }),
            ),
        );
    });

    /**
     * `carId` is a TAP TARGET — it becomes the URL the recipient follows. So
     * it is checked for existence rather than merely for being a string: a
     * notification must not be able to point somebody at a car that was never
     * in this group. [T15]
     */
    it("STOPS a carId that isn't a car in this group", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "ghost"),
                accessNotice({ carId: "no-such-car" }),
            ),
        );
    });

    it("STOPS a missing or empty carId", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "blank"),
                accessNotice({ carId: "" }),
            ),
        );

        // The whole key absent — the pre-T15 shape. Refused, so a stale client
        // can't write a notification the current one can't route.
        await assertFails(
            setDoc(doc(owner, "notifications", MEMBER, "items", "old"), {
                type: "access_changed",
                payload: {
                    groupId: GROUP_ID,
                    groupName: GROUP_NAME,
                    carName: "Mum's Myvi",
                    granted: true,
                },
                read: false,
                createdAt: serverTimestamp(),
            }),
        );
    });

    it("STOPS extra payload fields riding along", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "spam"),
                accessNotice({ message: "click http://evil.example" }),
            ),
        );
    });

    it("STOPS mixing this payload onto another type", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(doc(owner, "notifications", MEMBER, "items", "mixed"), {
                ...accessNotice(),
                type: "request_accepted",
            }),
        );
    });

    it("the recipient sees it through the badge query", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();
        await assertSucceeds(
            setDoc(
                doc(owner, "notifications", MEMBER, "items", "n1"),
                accessNotice({ granted: false }),
            ),
        );

        const member = testEnv.authenticatedContext(MEMBER).firestore();
        const unread = await assertSucceeds(
            getDocs(
                query(
                    collection(member, "notifications", MEMBER, "items"),
                    where("read", "==", false),
                ),
            ),
        );
        expect(unread.size).toBe(1);
        expect(unread.docs[0].data().payload.granted).toBe(false);
    });
});

// ------------------------------------------------ THE LEGITIMATE CROSS-WRITES

describe("the three legitimate cross-writes, as their real batches", () => {
    it("join request + owner notification commit together [G5, N1]", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        const batch = writeBatch(joiner);
        batch.set(doc(joiner, "joinRequests", "req-1"), {
            groupId: GROUP_ID,
            token: TOKEN,
            uid: JOINER,
            username: "Joiner",
            status: "pending",
            createdAt: serverTimestamp(),
        });
        batch.set(
            doc(joiner, "notifications", OWNER, "items", "n1"),
            notification("join_request", {}, { username: "Joiner" }),
        );

        await assertSucceeds(batch.commit());
    });

    it("accept + requester notification commit together [G7, N1]", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "joinRequests", "req-1"), {
                groupId: GROUP_ID,
                token: TOKEN,
                uid: JOINER,
                username: "Joiner",
                status: "pending",
                createdAt: new Date(),
            });
        });

        const owner = testEnv.authenticatedContext(OWNER).firestore();

        const batch = writeBatch(owner);
        batch.update(doc(owner, "groups", GROUP_ID), {
            memberIds: [OWNER, MEMBER, JOINER],
            members: {
                [OWNER]: { username: "Owner", joinedAt: new Date() },
                [MEMBER]: { username: "Member", joinedAt: new Date() },
                [JOINER]: { username: "Joiner", joinedAt: serverTimestamp() },
            },
        });
        batch.update(doc(owner, "joinRequests", "req-1"), { status: "accepted" });
        batch.set(
            doc(owner, "notifications", JOINER, "items", "n1"),
            notification("request_accepted"),
        );

        await assertSucceeds(batch.commit());
    });

    it("decline + requester notification commit together [G7, N1]", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "joinRequests", "req-1"), {
                groupId: GROUP_ID,
                token: TOKEN,
                uid: JOINER,
                username: "Joiner",
                status: "pending",
                createdAt: new Date(),
            });
        });

        const owner = testEnv.authenticatedContext(OWNER).firestore();

        const batch = writeBatch(owner);
        batch.update(doc(owner, "joinRequests", "req-1"), { status: "declined" });
        batch.set(
            doc(owner, "notifications", JOINER, "items", "n1"),
            notification("request_declined"),
        );

        await assertSucceeds(batch.commit());
    });

    it("removal + removed-member notification commit together [G10, N1]", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        const batch = writeBatch(owner);
        batch.update(doc(owner, "groups", GROUP_ID), {
            memberIds: [OWNER],
            members: { [OWNER]: { username: "Owner", joinedAt: new Date() } },
            canAddCars: [OWNER],
        });
        batch.set(
            doc(owner, "notifications", MEMBER, "items", "n1"),
            notification("removed_from_group"),
        );

        await assertSucceeds(batch.commit());
    });
});
