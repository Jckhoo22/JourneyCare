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
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Security-rules tests for `groups`. [S1]
 * Reads landed in T3 for H2's home query; creates, updates and deletes in T4
 * for G1/G11.
 */

const ALICE = "alice-uid";
const BOB = "bob-uid";
/** A member who does not own the group. */
const CAROL = "carol-uid";
const GROUP_ID = "family-car";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare-groups",
        firestore: {
            rules: readFileSync("firestore.rules", "utf8"),
        },
    });
});

afterAll(async () => {
    await testEnv?.cleanup();
});

beforeEach(async () => {
    await testEnv.clearFirestore();

    // Alice owns a group; Bob is not in it.
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "groups", GROUP_ID), {
            name: "Family Car",
            ownerId: ALICE,
            memberIds: [ALICE],
            members: { [ALICE]: { username: "Alice", joinedAt: new Date() } },
            canAddCars: [ALICE],
            joinToken: "token-123",
            createdAt: new Date(),
        });
    });
});

describe("groups/{groupId} reads", () => {
    it("lets a member read their group", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(getDoc(doc(alice, "groups", GROUP_ID)));
    });

    it("supports the home screen's array-contains query [H2]", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        const result = await assertSucceeds(
            getDocs(
                query(
                    collection(alice, "groups"),
                    where("memberIds", "array-contains", ALICE),
                ),
            ),
        );
        expect(result.size).toBe(1);
    });

    it("stops a non-member reading the group", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(getDoc(doc(bob, "groups", GROUP_ID)));
    });

    it("stops a non-member querying their way in", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        // Asking for Alice's groups is rejected outright, not filtered to empty.
        await assertFails(
            getDocs(
                query(
                    collection(bob, "groups"),
                    where("memberIds", "array-contains", ALICE),
                ),
            ),
        );
    });

    it("stops an unauthenticated visitor reading the group", async () => {
        const anon = testEnv.unauthenticatedContext().firestore();

        await assertFails(getDoc(doc(anon, "groups", GROUP_ID)));
    });

    it("rejects an unscoped listing of every group", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(getDocs(collection(alice, "groups")));
    });
});

/** A well-formed create payload: seeds `uid` alone. [G1] */
const seedPayload = (uid: string, overrides: Record<string, unknown> = {}) => ({
    name: "New Group",
    ownerId: uid,
    memberIds: [uid],
    members: { [uid]: { username: "Someone", joinedAt: new Date() } },
    canAddCars: [uid],
    joinToken: "0123456789abcdef0123456789abcdef",
    createdAt: new Date(),
    ...overrides,
});

describe("groups/{groupId} create [G1]", () => {
    it("lets a signed-in user create a group seeding themselves alone", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            setDoc(doc(alice, "groups", "brand-new"), seedPayload(ALICE)),
        );
    });

    // Mirrors useGroupActions.createGroup exactly: auto-id via addDoc, and
    // serverTimestamp() sentinels rather than concrete dates. The rule has to
    // accept the real client payload, not just a hand-built one.
    it("accepts the app's actual create call (addDoc + serverTimestamp)", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            addDoc(collection(alice, "groups"), {
                name: "Family Cars",
                ownerId: ALICE,
                memberIds: [ALICE],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: serverTimestamp() },
                },
                canAddCars: [ALICE],
                joinToken: "0123456789abcdef0123456789abcdef",
                createdAt: serverTimestamp(),
            }),
        );
    });

    it("stops a user creating a group owned by someone else", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(
                doc(alice, "groups", "brand-new"),
                seedPayload(ALICE, { ownerId: BOB }),
            ),
        );
    });

    it("stops a user creating a group with someone else already in it", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        // The whole point of pinning memberIds on create: no conscripting people.
        await assertFails(
            setDoc(
                doc(alice, "groups", "brand-new"),
                seedPayload(ALICE, { memberIds: [ALICE, BOB] }),
            ),
        );
    });

    it("stops a members map that disagrees with memberIds", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(
                doc(alice, "groups", "brand-new"),
                seedPayload(ALICE, {
                    members: {
                        [ALICE]: { username: "Alice", joinedAt: new Date() },
                        [BOB]: { username: "Bob", joinedAt: new Date() },
                    },
                }),
            ),
        );
    });

    it("stops granting car access to someone else at creation", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(
                doc(alice, "groups", "brand-new"),
                seedPayload(ALICE, { canAddCars: [ALICE, BOB] }),
            ),
        );
    });

    it("rejects an empty or oversized name", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(doc(alice, "groups", "empty-name"), seedPayload(ALICE, { name: "" })),
        );
        await assertFails(
            setDoc(
                doc(alice, "groups", "long-name"),
                seedPayload(ALICE, { name: "x".repeat(51) }),
            ),
        );
    });

    it("rejects a weak join token", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(
                doc(alice, "groups", "weak-token"),
                seedPayload(ALICE, { joinToken: "short" }),
            ),
        );
    });

    it("stops an unauthenticated visitor creating a group", async () => {
        const anon = testEnv.unauthenticatedContext().firestore();

        await assertFails(
            setDoc(doc(anon, "groups", "brand-new"), seedPayload(ALICE)),
        );
    });
});

/**
 * The group document's key whitelist. [T16 audit]
 *
 * `users` got one in T8 and `public/info` with it; the group document itself
 * was still open until the T16 sweep. It matters more here than on a profile,
 * not less: a group is read by EVERY member on a live listener, so an
 * arbitrary field parked on it is downloaded by everyone, and re-downloaded on
 * every subsequent change. Shape, not just auth.
 */
describe("groups/{groupId} field whitelist [T16 audit]", () => {
    it("STOPS a creator parking an extra field on their own group", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(
                doc(alice, "groups", "brand-new"),
                seedPayload(ALICE, { notes: "x".repeat(500) }),
            ),
        );
    });

    it("STOPS an owner adding one later", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", GROUP_ID), {
                payload: "arbitrary",
            }),
        );
    });

    /**
     * The branch this would have been forgotten on. A departing member's write
     * is shape-checked for membership but was never key-checked, so the
     * whitelist is applied outside the branch list rather than inside one.
     */
    it("STOPS a departing member smuggling a field out with them", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", GROUP_ID), {
                name: "Family Car",
                ownerId: ALICE,
                memberIds: [ALICE, CAROL],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
                joinToken: "token-123",
                createdAt: new Date(),
            });
        });

        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertFails(
            updateDoc(doc(carol, "groups", GROUP_ID), {
                memberIds: [ALICE],
                members: { [ALICE]: { username: "Alice", joinedAt: new Date() } },
                canAddCars: [ALICE],
                parting: "shot",
            }),
        );
    });

    it("still accepts every field the app legitimately writes", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        // carCount [P3a] and spendByYear [S2] are both on the whitelist —
        // without them T9's counter and T14's recalculate would bounce.
        await assertSucceeds(
            updateDoc(doc(alice, "groups", GROUP_ID), { carCount: 1 }),
        );
        await assertSucceeds(
            updateDoc(doc(alice, "groups", GROUP_ID), {
                spendByYear: { "2026": 100 },
            }),
        );
    });
});

describe("groups/{groupId} update", () => {
    it("lets the owner rename their group", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            updateDoc(doc(alice, "groups", GROUP_ID), { name: "Renamed" }),
        );
    });

    it("stops the owner handing ownership to someone else", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", GROUP_ID), { ownerId: BOB }),
        );
    });

    it("stops a non-member writing themselves into a group [S2 precursor]", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), { memberIds: [ALICE, BOB] }),
        );
    });

    it("stops a plain member updating the group", async () => {
        // Carol is in memberIds but does not own the group.
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", "shared"), {
                name: "Shared",
                ownerId: ALICE,
                memberIds: [ALICE, CAROL],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
                joinToken: "0123456789abcdef0123456789abcdef",
                createdAt: new Date(),
            });
        });

        const carol = testEnv.authenticatedContext(CAROL).firestore();

        // She can read it...
        await assertSucceeds(getDoc(doc(carol, "groups", "shared")));
        // ...but not change it.
        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), { name: "Carol's now" }),
        );
    });
});

/**
 * Car-adding rights and the car counter. [C1, P3a]
 *
 * Both live on the group document, and both had to widen what a non-owner may
 * write — which is exactly where a membership rule can spring a leak.
 */
/** Rename. [G12] */
describe("groups/{groupId} rename [G12]", () => {
    it("lets the owner rename their group", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            updateDoc(doc(alice, "groups", GROUP_ID), { name: "Renamed" }),
        );
    });

    it("STOPS an empty or oversized name", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", GROUP_ID), { name: "" }),
        );
        await assertFails(
            updateDoc(doc(alice, "groups", GROUP_ID), { name: "x".repeat(51) }),
        );
    });

    it("STOPS a non-string name", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", GROUP_ID), { name: 42 }),
        );
    });

    it("STOPS a member renaming the group", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", "shared"), {
                name: "Shared",
                ownerId: ALICE,
                memberIds: [ALICE, CAROL],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
                joinToken: "0123456789abcdef0123456789abcdef",
                createdAt: new Date(),
            });
        });

        const carol = testEnv.authenticatedContext(CAROL).firestore();
        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), { name: "Carol's now" }),
        );
    });

    it("STOPS a non-member renaming the group", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), { name: "Bob's now" }),
        );
    });

    // The rename path is metadata-only. It must not become a way to rotate the
    // invite token or to move membership.
    it("STOPS a rename rotating the invite token", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", GROUP_ID), {
                name: "Renamed",
                joinToken: "ffffffffffffffffffffffffffffffff",
            }),
        );
    });

    it("STOPS a rename smuggling in a new member", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", GROUP_ID), {
                name: "Renamed",
                memberIds: [ALICE, BOB],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [BOB]: { username: "Bob", joinedAt: new Date() },
                },
            }),
        );
    });

    it("STOPS a rename handing over ownership", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", GROUP_ID), {
                name: "Renamed",
                ownerId: BOB,
            }),
        );
    });
});

describe("groups/{groupId} car-adding rights [C1]", () => {
    const seedTwoMemberGroup = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", "shared"), {
                name: "Shared",
                ownerId: ALICE,
                memberIds: [ALICE, CAROL],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
                joinToken: "0123456789abcdef0123456789abcdef",
                carCount: 0,
                createdAt: new Date(),
            });
        });
    };

    beforeEach(seedTwoMemberGroup);

    it("lets the owner grant a member car-adding rights", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            updateDoc(doc(alice, "groups", "shared"), {
                canAddCars: [ALICE, CAROL],
            }),
        );
    });

    it("lets the owner revoke them again", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();
        await updateDoc(doc(alice, "groups", "shared"), {
            canAddCars: [ALICE, CAROL],
        });

        await assertSucceeds(
            updateDoc(doc(alice, "groups", "shared"), { canAddCars: [ALICE] }),
        );
    });

    // The cars rules trust this array, so a uid in it that isn't in the group
    // would be a way to hand an outsider write access to the group's cars.
    it("STOPS the owner granting car rights to a non-member", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", "shared"), {
                canAddCars: [ALICE, BOB],
            }),
        );
    });

    it("STOPS a member granting themselves car-adding rights", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), {
                canAddCars: [ALICE, CAROL],
            }),
        );
    });
});

describe("groups/{groupId} carCount [P3a]", () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", "shared"), {
                name: "Shared",
                ownerId: ALICE,
                memberIds: [ALICE, CAROL],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                },
                canAddCars: [ALICE, CAROL],
                joinToken: "0123456789abcdef0123456789abcdef",
                carCount: 3,
                createdAt: new Date(),
            });
        });
    });

    it("lets a member move the counter by one, either way", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertSucceeds(
            updateDoc(doc(carol, "groups", "shared"), { carCount: 4 }),
        );
        await assertSucceeds(
            updateDoc(doc(carol, "groups", "shared"), { carCount: 3 }),
        );
    });

    // The whole risk of opening group updates to members: it must stay a
    // counter branch, not a general write.
    it("STOPS a member smuggling a rename alongside the counter", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), {
                carCount: 4,
                name: "Carol's now",
            }),
        );
    });

    it("STOPS a member rotating the join token alongside the counter", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), {
                carCount: 4,
                joinToken: "ffffffffffffffffffffffffffffffff",
            }),
        );
    });

    it("STOPS a member writing themselves car rights alongside the counter", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), {
                carCount: 4,
                canAddCars: [ALICE, CAROL, BOB],
            }),
        );
    });

    it("STOPS jumping the counter by more than one", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), { carCount: 99 }),
        );
    });

    it("STOPS driving the counter negative", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await updateDoc(doc(context.firestore(), "groups", "shared"), {
                carCount: 0,
            });
        });

        const carol = testEnv.authenticatedContext(CAROL).firestore();
        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), { carCount: -1 }),
        );
    });

    it("STOPS a non-member touching the counter", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", "shared"), { carCount: 4 }),
        );
    });

    it("STOPS a non-numeric counter", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), { carCount: "four" }),
        );
    });
});

describe("groups/{groupId} member removal [G10]", () => {
    const DAVE = "dave-uid";

    /** Alice owns; Carol and Dave are ordinary members. */
    const seedThreeMemberGroup = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", "shared"), {
                name: "Shared",
                ownerId: ALICE,
                memberIds: [ALICE, CAROL, DAVE],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [ALICE, CAROL],
                joinToken: "0123456789abcdef0123456789abcdef",
                createdAt: new Date(),
            });
        });
    };

    beforeEach(seedThreeMemberGroup);

    it("lets the owner remove a member", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            updateDoc(doc(alice, "groups", "shared"), {
                memberIds: [ALICE, DAVE],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
            }),
        );
    });

    it("lets a member remove themselves", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertSucceeds(
            updateDoc(doc(carol, "groups", "shared"), {
                memberIds: [ALICE, DAVE],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
            }),
        );
    });

    it("STOPS a member removing somebody else", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        // Carol tries to evict Dave. She is a member, and the write is a
        // well-formed single removal — it must still fail, because it isn't her.
        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), {
                memberIds: [ALICE, CAROL],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                },
                canAddCars: [ALICE, CAROL],
            }),
        );
    });

    it("STOPS a member removing the owner", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), {
                memberIds: [CAROL, DAVE],
                members: {
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [CAROL],
            }),
        );
    });

    it("STOPS the owner removing themselves — they must delete the group", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", "shared"), {
                memberIds: [CAROL, DAVE],
                members: {
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [CAROL],
            }),
        );
    });

    it("STOPS a non-member removing anyone", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", "shared"), {
                memberIds: [ALICE, DAVE],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
            }),
        );
    });

    it("STOPS removing two members at once", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", "shared"), {
                memberIds: [ALICE],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
            }),
        );
    });

    it("STOPS a leaver keeping their car-adding rights", async () => {
        const carol = testEnv.authenticatedContext(CAROL).firestore();

        await assertFails(
            updateDoc(doc(carol, "groups", "shared"), {
                memberIds: [ALICE, DAVE],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [ALICE, CAROL], // still there
            }),
        );
    });

    it("STOPS a removal smuggling in a rename or token rotation", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", "shared"), {
                name: "Renamed mid-removal",
                memberIds: [ALICE, DAVE],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
            }),
        );

        await assertFails(
            updateDoc(doc(alice, "groups", "shared"), {
                joinToken: "ffffffffffffffffffffffffffffffff",
                memberIds: [ALICE, DAVE],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
            }),
        );
    });

    it("STOPS memberIds and members drifting apart on removal", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            updateDoc(doc(alice, "groups", "shared"), {
                memberIds: [ALICE, DAVE],
                // Carol left memberIds but lingers in the map.
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                    [DAVE]: { username: "Dave", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
            }),
        );
    });

    it("a removed member can no longer read the group", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();
        await updateDoc(doc(alice, "groups", "shared"), {
            memberIds: [ALICE, DAVE],
            members: {
                [ALICE]: { username: "Alice", joinedAt: new Date() },
                [DAVE]: { username: "Dave", joinedAt: new Date() },
            },
            canAddCars: [ALICE],
        });

        const carol = testEnv.authenticatedContext(CAROL).firestore();
        await assertFails(getDoc(doc(carol, "groups", "shared")));
    });
});

describe("groups/{groupId} delete [G11]", () => {
    it("lets the owner delete their group", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(deleteDoc(doc(alice, "groups", GROUP_ID)));
    });

    // The case that matters: someone legitimately inside the group, who can
    // read it and sees no delete button, must still be refused by the server.
    it("stops a member who is not the owner deleting the group", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", "shared"), {
                name: "Shared",
                ownerId: ALICE,
                memberIds: [ALICE, CAROL],
                members: {
                    [ALICE]: { username: "Alice", joinedAt: new Date() },
                    [CAROL]: { username: "Carol", joinedAt: new Date() },
                },
                canAddCars: [ALICE],
                joinToken: "0123456789abcdef0123456789abcdef",
                createdAt: new Date(),
            });
        });

        const carol = testEnv.authenticatedContext(CAROL).firestore();

        // Carol can see the group...
        await assertSucceeds(getDoc(doc(carol, "groups", "shared")));
        // ...and still cannot delete it.
        await assertFails(deleteDoc(doc(carol, "groups", "shared")));
    });

    it("stops a non-member deleting the group", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(deleteDoc(doc(bob, "groups", GROUP_ID)));
    });

    it("stops an unauthenticated visitor deleting the group", async () => {
        const anon = testEnv.unauthenticatedContext().firestore();

        await assertFails(deleteDoc(doc(anon, "groups", GROUP_ID)));
    });
});
