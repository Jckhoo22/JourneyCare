import { readFileSync } from "node:fs";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Security-rules tests for firestore.rules. [S3]
 * Run with `npm run test:rules`, which starts the Firestore emulator first.
 */

const ALICE = "alice-uid";
const BOB = "bob-uid";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare",
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
});

/** Seeds a profile bypassing rules, so read tests have something to read. */
const seedProfile = async (uid: string) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users", uid), {
            username: uid,
            email: `${uid}@example.com`,
            createdAt: new Date(),
        });
    });
};

describe("users/{uid}", () => {
    it("lets a signed-in user create their own profile", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            setDoc(doc(alice, "users", ALICE), {
                username: "Alice",
                email: "alice@example.com",
                createdAt: new Date(),
            }),
        );
    });

    it("lets a signed-in user read their own profile", async () => {
        await seedProfile(ALICE);
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(getDoc(doc(alice, "users", ALICE)));
    });

    it("lets a signed-in user update their own profile", async () => {
        await seedProfile(ALICE);
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            updateDoc(doc(alice, "users", ALICE), { username: "Alice Renamed" }),
        );
    });

    // A6 moved profile creation from registration to the username screen, so a
    // signed-in user may write this doc for the first time well after sign-in,
    // and may be completing a doc that exists without a username.
    it("lets a user fill in a missing username on their own doc [A6]", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", ALICE), {
                email: "alice@example.com",
                createdAt: new Date(),
            });
        });

        const alice = testEnv.authenticatedContext(ALICE).firestore();
        await assertSucceeds(
            updateDoc(doc(alice, "users", ALICE), { username: "Alice" }),
        );
    });

    it("stops a user filling in someone else's missing username [A6]", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", ALICE), {
                email: "alice@example.com",
                createdAt: new Date(),
            });
        });

        const bob = testEnv.authenticatedContext(BOB).firestore();
        await assertFails(
            updateDoc(doc(bob, "users", ALICE), { username: "Hijacked" }),
        );
    });

    it("stops a user reading someone else's profile", async () => {
        await seedProfile(ALICE);
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(getDoc(doc(bob, "users", ALICE)));
    });

    it("stops a user writing someone else's profile", async () => {
        await seedProfile(ALICE);
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            setDoc(doc(bob, "users", ALICE), {
                username: "Hijacked",
                email: "bob@example.com",
                createdAt: new Date(),
            }),
        );
    });

    it("stops an unauthenticated visitor reading any profile", async () => {
        await seedProfile(ALICE);
        const anon = testEnv.unauthenticatedContext().firestore();

        await assertFails(getDoc(doc(anon, "users", ALICE)));
    });

    it("stops an unauthenticated visitor creating a profile", async () => {
        const anon = testEnv.unauthenticatedContext().firestore();

        await assertFails(
            setDoc(doc(anon, "users", ALICE), {
                username: "Anon",
                email: "anon@example.com",
                createdAt: new Date(),
            }),
        );
    });
});

describe("users/{uid} shape validation [T8 audit]", () => {
    it("STOPS extra fields being parked on a profile", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(doc(alice, "users", ALICE), {
                username: "Alice",
                email: "alice@example.com",
                createdAt: new Date(),
                isAdmin: true,
            }),
        );
    });

    it("STOPS an oversized username", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        // It propagates into group `members` maps and notifications, so an
        // unbounded one is not contained to the writer.
        await assertFails(
            setDoc(doc(alice, "users", ALICE), {
                username: "x".repeat(500),
                email: "alice@example.com",
                createdAt: new Date(),
            }),
        );
    });

    it("STOPS an empty username", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(doc(alice, "users", ALICE), {
                username: "",
                email: "alice@example.com",
                createdAt: new Date(),
            }),
        );
    });

    it("STOPS deleting a profile", async () => {
        await seedProfile(ALICE);
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(deleteDoc(doc(alice, "users", ALICE)));
    });
});

/**
 * `groupsOwned`. [P3b]
 *
 * Phase 3 will validate a per-user group limit against this, because rules
 * cannot count documents. Worth being clear about what these tests do and
 * don't prove: a user owns their own profile document, so they can write any
 * value they like here. Bounding it to a non-negative integer is hygiene, not
 * enforcement — the limit it feeds is advisory.
 */
describe("users/{uid} groupsOwned [P3b]", () => {
    it("accepts a counter alongside the profile", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            setDoc(doc(alice, "users", ALICE), {
                username: "Alice",
                email: "alice@example.com",
                createdAt: new Date(),
                groupsOwned: 2,
            }),
        );
    });

    it("accepts a profile with no counter at all", async () => {
        // Profiles created before T9 have none, and must keep working.
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertSucceeds(
            setDoc(doc(alice, "users", ALICE), {
                username: "Alice",
                email: "alice@example.com",
                createdAt: new Date(),
            }),
        );
    });

    it("STOPS a negative counter", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(doc(alice, "users", ALICE), {
                username: "Alice",
                email: "alice@example.com",
                createdAt: new Date(),
                groupsOwned: -1,
            }),
        );
    });

    it("STOPS a non-numeric counter", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(doc(alice, "users", ALICE), {
                username: "Alice",
                email: "alice@example.com",
                createdAt: new Date(),
                groupsOwned: "many",
            }),
        );
    });

    it("STOPS writing a counter onto someone else's profile", async () => {
        await seedProfile(ALICE);
        const bob = testEnv.authenticatedContext(BOB).firestore();

        await assertFails(
            updateDoc(doc(bob, "users", ALICE), { groupsOwned: 99 }),
        );
    });
});

describe("default deny", () => {
    it("blocks reads of collections Phase 1 hasn't opened yet", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(getDoc(doc(alice, "groups", "some-group")));
        await assertFails(getDoc(doc(alice, "joinRequests", "some-request")));
    });

    it("blocks writes to collections Phase 1 hasn't opened yet", async () => {
        const alice = testEnv.authenticatedContext(ALICE).firestore();

        await assertFails(
            setDoc(doc(alice, "groups", "some-group"), { name: "Nice try" }),
        );
        await assertFails(
            setDoc(doc(alice, "notifications", ALICE), { read: false }),
        );
    });
});
