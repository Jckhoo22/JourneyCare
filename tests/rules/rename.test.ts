import { readFileSync } from "node:fs";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Security-rules tests for the self-rename branch. [SET2, D2]
 *
 * `groups/{gid}.members[uid].username` is a denormalised copy of the profile's
 * username, and `isOwnUsernameUpdate` is what lets a member move their own
 * copy. It is the first rule in this app that lets a NON-OWNER write to the
 * group document for a reason other than leaving it, so the interesting tests
 * here are all about what it still refuses.
 *
 * Treat the refusal cases as the spec, the same way joinRequests.test.ts is
 * treated: the Phase 1 property is that nobody can write themselves into a
 * group, and this branch must not become the exception.
 */

const ALICE = "alice-uid"; // owner
const BOB = "bob-uid"; // ordinary member
const MALLORY = "mallory-uid"; // not a member
const GROUP_ID = "family-car";

const JOINED = new Date("2026-01-01T00:00:00Z");

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare-rename",
        firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
});

afterAll(async () => {
    await testEnv?.cleanup();
});

beforeEach(async () => {
    await testEnv.clearFirestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "groups", GROUP_ID), {
            name: "Family Car",
            ownerId: ALICE,
            memberIds: [ALICE, BOB],
            members: {
                [ALICE]: { username: "Alice", joinedAt: JOINED },
                [BOB]: { username: "Bob", joinedAt: JOINED },
            },
            canAddCars: [ALICE],
            joinToken: "token-123",
            createdAt: new Date(),
            carCount: 2,
            spendByYear: { "2026": 450 },
        });
    });
});

describe("a member renaming themselves", () => {
    it("lets an ordinary member update their own username", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertSucceeds(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
            }),
        );
    });

    it("lets the owner update their own username the same way", async () => {
        // The owner has isOwnerUpdate available too, but the fan-out writes the
        // same shape for everybody — it must not depend on who you are.
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            updateDoc(doc(alice, "groups", GROUP_ID), {
                [`members.${ALICE}.username`]: "Alicia",
            }),
        );
    });

    it("accepts a 20-character name and refuses 21", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertSucceeds(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "a".repeat(20),
            }),
        );
        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "a".repeat(21),
            }),
        );
    });

    it("refuses an empty username", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "",
            }),
        );
    });

    it("refuses a non-string username", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: 42,
            }),
        );
    });
});

describe("what the rename branch must still refuse", () => {
    it("stops a member renaming SOMEBODY ELSE", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${ALICE}.username`]: "Not Alice",
            }),
        );
    });

    it("stops a member renaming themselves AND someone else in one write", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
                [`members.${ALICE}.username`]: "Not Alice",
            }),
        );
    });

    it("stops a non-member writing a username into the group", async () => {
        const mallory = testEnv.authenticatedContext(MALLORY).firestore();

        await assertFails(
            updateDoc(doc(mallory, "groups", GROUP_ID), {
                [`members.${MALLORY}.username`]: "Mallory",
            }),
        );
    });

    it("stops a member adding a members entry for a non-member", async () => {
        // The Phase 1 property: no write here may put anybody into the group.
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${MALLORY}.username`]: "Mallory",
            }),
        );
    });

    it("stops a rename from smuggling in memberIds", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
                memberIds: [ALICE, BOB, MALLORY],
            }),
        );
    });

    it("stops a rename from re-dating when the member joined", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
                [`members.${BOB}.joinedAt`]: new Date("2020-01-01T00:00:00Z"),
            }),
        );
    });

    it("stops a rename from renaming the GROUP", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
                name: "Bob's Car Now",
            }),
        );
    });

    it("stops a rename from rotating the invite token", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
                joinToken: "token-mallory",
            }),
        );
    });

    it("stops a rename from granting car-adding rights", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
                canAddCars: [ALICE, BOB],
            }),
        );
    });

    it("stops a rename from taking ownership", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
                ownerId: BOB,
            }),
        );
    });

    it("stops a rename from moving the spend counters", async () => {
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
                spendByYear: { "2026": 0 },
            }),
        );
    });

    it("stops an unauthenticated visitor renaming anyone", async () => {
        const anon = testEnv.unauthenticatedContext().firestore();

        await assertFails(
            updateDoc(doc(anon, "groups", GROUP_ID), {
                [`members.${BOB}.username`]: "Bobby",
            }),
        );
    });
});
