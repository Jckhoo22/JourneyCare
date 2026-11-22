import { readFileSync } from "node:fs";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
    addDoc,
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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Security-rules tests for the join flow. [S2]
 *
 * The property under test: a requester can never write themselves into a group.
 * The attack cases below are the point of this file — the happy paths only
 * exist to prove the rules aren't vacuously denying everything.
 */

const OWNER = "owner-uid";
const JOINER = "joiner-uid";
const STRANGER = "stranger-uid";

const GROUP_ID = "family-car";
const TOKEN = "0123456789abcdef0123456789abcdef";
const WRONG_TOKEN = "ffffffffffffffffffffffffffffffff";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare-join",
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

        await setDoc(doc(db, "groups", GROUP_ID), {
            name: "Family Car",
            ownerId: OWNER,
            memberIds: [OWNER],
            members: { [OWNER]: { username: "Owner", joinedAt: new Date() } },
            canAddCars: [OWNER],
            joinToken: TOKEN,
            createdAt: new Date(),
        });

        await setDoc(doc(db, "groups", GROUP_ID, "public", "info"), {
            name: "Family Car",
            ownerId: OWNER,
        });
    });
});

/** A well-formed pending request from `uid`. */
const pendingRequest = (
    uid: string,
    overrides: Record<string, unknown> = {},
) => ({
    groupId: GROUP_ID,
    token: TOKEN,
    uid,
    username: "Joiner",
    status: "pending",
    createdAt: new Date(),
    ...overrides,
});

/** Seeds a pending request bypassing rules. */
const seedRequest = async (
    requestId: string,
    uid: string,
    overrides: Record<string, unknown> = {},
) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
            doc(context.firestore(), "joinRequests", requestId),
            pendingRequest(uid, overrides),
        );
    });
};

// ---------------------------------------------------------------- ATTACKS

describe("ATTACK: a requester cannot write themselves into a group", () => {
    it("(a) direct write into memberIds is denied", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            updateDoc(doc(joiner, "groups", GROUP_ID), {
                memberIds: [OWNER, JOINER],
            }),
        );
    });

    it("(a2) even with a valid token and a pending request, they still can't", async () => {
        await seedRequest("req-1", JOINER);
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        // Having asked nicely changes nothing about who may write the group.
        await assertFails(
            updateDoc(doc(joiner, "groups", GROUP_ID), {
                memberIds: [OWNER, JOINER],
                members: {
                    [OWNER]: { username: "Owner", joinedAt: new Date() },
                    [JOINER]: { username: "Joiner", joinedAt: new Date() },
                },
            }),
        );
    });

    it("(a3) accepting their own request is denied", async () => {
        await seedRequest("req-1", JOINER);
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            updateDoc(doc(joiner, "joinRequests", "req-1"), {
                status: "accepted",
            }),
        );
    });

    it("(a4) the batched accept, run by the requester, is denied", async () => {
        await seedRequest("req-1", JOINER);
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        const batch = writeBatch(joiner);
        batch.update(doc(joiner, "groups", GROUP_ID), {
            memberIds: [OWNER, JOINER],
            members: {
                [OWNER]: { username: "Owner", joinedAt: new Date() },
                [JOINER]: { username: "Joiner", joinedAt: new Date() },
            },
        });
        batch.update(doc(joiner, "joinRequests", "req-1"), { status: "accepted" });

        await assertFails(batch.commit());
    });
});

/**
 * The join request's key whitelist. [T16 audit]
 *
 * This is the only document in the system a NON-MEMBER writes and a group
 * owner then reads, which makes it the one place a stranger's text reaches
 * someone else's screen. `username` has been length-capped since T8 for
 * exactly that reason — and an open key set walked straight around the cap.
 */
describe("ATTACK: joinRequests field whitelist [T16 audit]", () => {
    it("STOPS a requester attaching an extra field", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "joinRequests", "smuggled"),
                pendingRequest(JOINER, { message: "x".repeat(2000) }),
            ),
        );
    });

    it("STOPS an owner attaching one when they decide", async () => {
        await seedRequest("req-1", JOINER);
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(owner, "joinRequests", "req-1"), {
                status: "accepted",
                note: "arbitrary",
            }),
        );
    });

    it("still accepts the exact shape the app writes", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertSucceeds(
            setDoc(doc(joiner, "joinRequests", "real"), pendingRequest(JOINER)),
        );
    });
});

describe("ATTACK: request forgery", () => {
    it("(b) creating a request with someone else's uid is denied", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "joinRequests", "forged"),
                pendingRequest(STRANGER),
            ),
        );
    });

    it("(c) creating a request with a wrong token is denied", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "joinRequests", "wrong-token"),
                pendingRequest(JOINER, { token: WRONG_TOKEN }),
            ),
        );
    });

    it("(c2) creating a request with no token at all is denied", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();
        const { token: _token, ...withoutToken } = pendingRequest(JOINER);

        await assertFails(
            setDoc(doc(joiner, "joinRequests", "no-token"), withoutToken),
        );
    });

    it("creating a request for a group that doesn't exist is denied", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "joinRequests", "ghost"),
                pendingRequest(JOINER, { groupId: "no-such-group" }),
            ),
        );
    });

    it("STOPS an oversized username, which an accept would copy into the group", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "joinRequests", "bloat"),
                pendingRequest(JOINER, { username: "x".repeat(500) }),
            ),
        );
    });

    it("creating a pre-accepted request is denied", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertFails(
            setDoc(
                doc(joiner, "joinRequests", "pre-accepted"),
                pendingRequest(JOINER, { status: "accepted" }),
            ),
        );
    });

    it("an existing member cannot create a request", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            setDoc(
                doc(owner, "joinRequests", "already-in"),
                pendingRequest(OWNER),
            ),
        );
    });

    it("an unauthenticated visitor cannot create a request", async () => {
        const anon = testEnv.unauthenticatedContext().firestore();

        await assertFails(
            setDoc(doc(anon, "joinRequests", "anon"), pendingRequest(JOINER)),
        );
    });
});

describe("ATTACK: deciding other people's requests", () => {
    it("(d) a non-owner accepting a request is denied", async () => {
        await seedRequest("req-1", JOINER);
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            updateDoc(doc(stranger, "joinRequests", "req-1"), {
                status: "accepted",
            }),
        );
    });

    it("a plain member (not owner) cannot accept", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", GROUP_ID), {
                name: "Family Car",
                ownerId: OWNER,
                memberIds: [OWNER, STRANGER],
                members: {
                    [OWNER]: { username: "Owner", joinedAt: new Date() },
                    [STRANGER]: { username: "Member", joinedAt: new Date() },
                },
                canAddCars: [OWNER],
                joinToken: TOKEN,
                createdAt: new Date(),
            });
        });
        await seedRequest("req-1", JOINER);

        const member = testEnv.authenticatedContext(STRANGER).firestore();
        await assertFails(
            updateDoc(doc(member, "joinRequests", "req-1"), { status: "accepted" }),
        );
    });

    it("a decided request cannot be re-decided", async () => {
        await seedRequest("req-1", JOINER, { status: "declined" });
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(owner, "joinRequests", "req-1"), { status: "accepted" }),
        );
    });

    it("the owner cannot redirect a decision onto a different uid", async () => {
        await seedRequest("req-1", JOINER);
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(owner, "joinRequests", "req-1"), {
                status: "accepted",
                uid: STRANGER,
            }),
        );
    });

    it("the owner cannot park a request back into pending", async () => {
        await seedRequest("req-1", JOINER);
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(owner, "joinRequests", "req-1"), { status: "pending" }),
        );
    });
});

describe("ATTACK: reading other people's requests", () => {
    it("a stranger cannot read someone else's request", async () => {
        await seedRequest("req-1", JOINER);
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(getDoc(doc(stranger, "joinRequests", "req-1")));
    });

    it("nobody can list requests across all groups", async () => {
        await seedRequest("req-1", JOINER);
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(getDocs(collection(stranger, "joinRequests")));
    });
});

describe("ATTACK: smuggling changes through an accept", () => {
    it("an accept cannot also rename the group", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(owner, "groups", GROUP_ID), {
                name: "Renamed mid-accept",
                memberIds: [OWNER, JOINER],
                members: {
                    [OWNER]: { username: "Owner", joinedAt: new Date() },
                    [JOINER]: { username: "Joiner", joinedAt: new Date() },
                },
            }),
        );
    });

    it("an accept cannot also rotate the join token", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(owner, "groups", GROUP_ID), {
                joinToken: WRONG_TOKEN,
                memberIds: [OWNER, JOINER],
                members: {
                    [OWNER]: { username: "Owner", joinedAt: new Date() },
                    [JOINER]: { username: "Joiner", joinedAt: new Date() },
                },
            }),
        );
    });

    it("an owner cannot add two members at once", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(owner, "groups", GROUP_ID), {
                memberIds: [OWNER, JOINER, STRANGER],
                members: {
                    [OWNER]: { username: "Owner", joinedAt: new Date() },
                    [JOINER]: { username: "Joiner", joinedAt: new Date() },
                    [STRANGER]: { username: "Stranger", joinedAt: new Date() },
                },
            }),
        );
    });

    it("an owner cannot remove a member through this path", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        // Removal is T6's business, not an accept's.
        await assertFails(
            updateDoc(doc(owner, "groups", GROUP_ID), {
                memberIds: [],
                members: {},
            }),
        );
    });

    it("memberIds and members must stay in step", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(owner, "groups", GROUP_ID), {
                memberIds: [OWNER, JOINER],
                // members not updated to match
                members: { [OWNER]: { username: "Owner", joinedAt: new Date() } },
            }),
        );
    });
});

// ------------------------------------------------- THE BUG THIS FILE MISSED

describe("a NON-MEMBER can complete the whole join-request flow", () => {
    /**
     * Regression test. The join screen used to read groups/{id} to show the
     * group's name — which a non-member is not allowed to do (S1), so every
     * real invite failed with permission-denied. The rules were right; the
     * client was asking for something it could never have.
     *
     * This walks the exact sequence the join screen now performs, as a user
     * who is not in the group.
     */
    it("reads the public name, sees no pending request, and creates one", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        // 1. The group document itself stays off-limits — unchanged by the fix.
        await assertFails(getDoc(doc(joiner, "groups", GROUP_ID)));

        // 2. But the public name is readable, so the screen can say what this is.
        const info = await assertSucceeds(
            getDoc(doc(joiner, "groups", GROUP_ID, "public", "info")),
        );
        expect(info.data()?.name).toBe("Family Car");

        // 3. No outstanding request of their own.
        const existing = await assertSucceeds(
            getDocs(
                query(
                    collection(joiner, "joinRequests"),
                    where("uid", "==", JOINER),
                    where("groupId", "==", GROUP_ID),
                    where("status", "==", "pending"),
                ),
            ),
        );
        expect(existing.empty).toBe(true);

        // 4. And they can ask to join.
        await assertSucceeds(
            addDoc(collection(joiner, "joinRequests"), {
                groupId: GROUP_ID,
                token: TOKEN,
                uid: JOINER,
                username: "Joiner",
                status: "pending",
                createdAt: serverTimestamp(),
            }),
        );
    });

    it("the public window leaks only the name — never the token", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        const info = await getDoc(
            doc(joiner, "groups", GROUP_ID, "public", "info"),
        );
        const data = info.data() ?? {};

        expect(data.joinToken).toBeUndefined();
        expect(data.memberIds).toBeUndefined();
        expect(Object.keys(data).sort()).toEqual(["name", "ownerId"]);
    });

    it("a wrong token still fails, even though the name was readable", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        // Seeing the name grants nothing: the token is still the capability.
        await assertSucceeds(
            getDoc(doc(joiner, "groups", GROUP_ID, "public", "info")),
        );
        await assertFails(
            addDoc(collection(joiner, "joinRequests"), {
                groupId: GROUP_ID,
                token: WRONG_TOKEN,
                uid: JOINER,
                username: "Joiner",
                status: "pending",
                createdAt: serverTimestamp(),
            }),
        );
    });

    it("an unauthenticated visitor cannot read the public name", async () => {
        const anon = testEnv.unauthenticatedContext().firestore();

        await assertFails(
            getDoc(doc(anon, "groups", GROUP_ID, "public", "info")),
        );
    });

    it("STOPS extra fields being parked in the public window", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        // This is the one document readable outside the group, so it must not
        // become a place to broadcast arbitrary content. [T8 audit]
        await assertFails(
            setDoc(doc(owner, "groups", GROUP_ID, "public", "info"), {
                name: "Family Car",
                ownerId: OWNER,
                message: "click http://evil.example",
            }),
        );
    });

    it("a non-owner cannot rewrite the public name", async () => {
        const stranger = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            setDoc(doc(stranger, "groups", GROUP_ID, "public", "info"), {
                name: "Vandalised",
                ownerId: STRANGER,
            }),
        );
    });

    it("the owner can create and refresh the public name", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            setDoc(doc(owner, "groups", GROUP_ID, "public", "info"), {
                name: "Family Car Renamed",
                ownerId: OWNER,
            }),
        );
    });
});

// ---------------------------------------------------------------- HAPPY PATHS

describe("the flow actually works", () => {
    it("a signed-in stranger with the right token can request to join", async () => {
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertSucceeds(
            setDoc(doc(joiner, "joinRequests", "req-1"), pendingRequest(JOINER)),
        );
    });

    it("the requester can read their own request back", async () => {
        await seedRequest("req-1", JOINER);
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertSucceeds(getDoc(doc(joiner, "joinRequests", "req-1")));
    });

    it("the requester can check whether they already have one pending", async () => {
        await seedRequest("req-1", JOINER);
        const joiner = testEnv.authenticatedContext(JOINER).firestore();

        await assertSucceeds(
            getDocs(
                query(
                    collection(joiner, "joinRequests"),
                    where("uid", "==", JOINER),
                    where("groupId", "==", GROUP_ID),
                ),
            ),
        );
    });

    it("the owner can list pending requests for their group", async () => {
        await seedRequest("req-1", JOINER);
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        const result = await assertSucceeds(
            getDocs(
                query(
                    collection(owner, "joinRequests"),
                    where("groupId", "==", GROUP_ID),
                    where("status", "==", "pending"),
                ),
            ),
        );
        expect(result.size).toBe(1);
    });

    it("(e) the owner's batched accept is allowed, and is atomic", async () => {
        await seedRequest("req-1", JOINER);
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        const batch = writeBatch(owner);
        batch.update(doc(owner, "groups", GROUP_ID), {
            memberIds: [OWNER, JOINER],
            members: {
                [OWNER]: { username: "Owner", joinedAt: new Date() },
                [JOINER]: { username: "Joiner", joinedAt: serverTimestamp() },
            },
        });
        batch.update(doc(owner, "joinRequests", "req-1"), { status: "accepted" });

        await assertSucceeds(batch.commit());

        // And the joiner really is in now.
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const snap = await getDoc(doc(context.firestore(), "groups", GROUP_ID));
            expect(snap.data()?.memberIds).toEqual([OWNER, JOINER]);
        });
    });

    it("the owner can decline", async () => {
        await seedRequest("req-1", JOINER);
        const owner = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            updateDoc(doc(owner, "joinRequests", "req-1"), { status: "declined" }),
        );
    });

    it("a newly accepted member can now read the group", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", GROUP_ID), {
                name: "Family Car",
                ownerId: OWNER,
                memberIds: [OWNER, JOINER],
                members: {
                    [OWNER]: { username: "Owner", joinedAt: new Date() },
                    [JOINER]: { username: "Joiner", joinedAt: new Date() },
                },
                canAddCars: [OWNER],
                joinToken: TOKEN,
                createdAt: new Date(),
            });
        });

        const joiner = testEnv.authenticatedContext(JOINER).firestore();
        await assertSucceeds(getDoc(doc(joiner, "groups", GROUP_ID)));
    });
});
