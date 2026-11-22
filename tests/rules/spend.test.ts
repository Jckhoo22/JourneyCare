import { readFileSync } from "node:fs";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
    Timestamp,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Security-rules tests for the T14 spend dashboard. [S1–S3]
 *
 * The dashboard itself is pure DISPLAY over counters T12 already maintains, so
 * it opens no read path that didn't exist. The one thing T14 adds is a WRITE:
 * "Recalculate totals", which rewrites `car.totalSpend`, `car.lastByType` and
 * `group.spendByYear` from a full read of the history — outside any log batch.
 *
 * ── What is actually being asserted here ────────────────────────────────────
 * That this write path exists, is reachable by the owner, and — critically —
 * that it did NOT widen anything on the way in. Recalculate rides the branches
 * T12 and T9 already opened (`isLogDenormalisation` on the car, the owner
 * metadata branch on the group), because those branches never could verify
 * that a counter change accompanied a real log — a batch's writes are
 * evaluated independently, so the sibling write is invisible from a rule. That
 * limitation is documented in firestore.rules and in plan.md, and Recalculate
 * is the repair it implies.
 *
 * So the boundary that matters is unchanged and is re-asserted below: a
 * view-only member cannot touch a total, a non-member cannot touch anything,
 * and a counter write still cannot smuggle an access grant, a photo or an
 * odometer decrease along with it.
 */

const OWNER = "owner-uid";
/** Holds edit on the car by having created it. */
const CREATOR = "creator-uid";
/** In the group, no edit at all — the view floor case. */
const MEMBER = "member-uid";
const STRANGER = "stranger-uid";

const GROUP_ID = "family-car";
const CAR_ID = "myvi";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare-spend",
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
            memberIds: [OWNER, CREATOR, MEMBER],
            members: {
                [OWNER]: { username: "Owner", joinedAt: new Date() },
                [CREATOR]: { username: "Creator", joinedAt: new Date() },
                [MEMBER]: { username: "Member", joinedAt: new Date() },
            },
            canAddCars: [OWNER, CREATOR],
            joinToken: "0123456789abcdef0123456789abcdef",
            carCount: 1,
            // Deliberately WRONG — this is the drift Recalculate repairs.
            spendByYear: { "2025": 40, "2026": 999 },
            createdAt: new Date(),
        });

        await setDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
            brand: "Perodua",
            model: "Myvi",
            year: 2018,
            odometer: 128400,
            access: {},
            lastByType: {
                engine_oil: {
                    date: Timestamp.fromDate(new Date("2026-01-01T00:00:00")),
                    odometer: 118000,
                    intervalKm: 10000,
                },
            },
            statusStamp: { engine_oil: "overdue" },
            totalSpend: 999,
            createdBy: CREATOR,
            createdAt: new Date(),
        });
    });
});

const carRef = (uid: string) =>
    doc(
        testEnv.authenticatedContext(uid).firestore(),
        "groups",
        GROUP_ID,
        "cars",
        CAR_ID,
    );

const groupRef = (uid: string) =>
    doc(testEnv.authenticatedContext(uid).firestore(), "groups", GROUP_ID);

/** Exactly what useRecalculateSpend writes to a car: two whole maps/values. */
const carRecalc = {
    totalSpend: 500.5,
    lastByType: {
        engine_oil: {
            date: Timestamp.fromDate(new Date("2026-07-01T00:00:00")),
            odometer: 128400,
            intervalKm: 10000,
            intervalMonths: 6,
        },
    },
};

// ──────────────────────────────────────────────────── THE RECALC WRITE PATH

describe("Recalculate — the counter rewrite outside a log batch [T14]", () => {
    it("lets the group owner rewrite a car's totals", async () => {
        await assertSucceeds(updateDoc(carRef(OWNER), carRecalc));
    });

    it("lets the group owner rewrite the group's spendByYear", async () => {
        await assertSucceeds(
            updateDoc(groupRef(OWNER), { spendByYear: { "2026": 500.5 } }),
        );
    });

    /**
     * The shape Recalculate actually commits: several cars and the group in one
     * batch. Worth asserting as a batch rather than as separate writes, because
     * that is the only form the client ever sends.
     */
    it("lets the owner commit the whole repair in one batch", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();
        const batch = writeBatch(db);

        batch.update(doc(db, "groups", GROUP_ID, "cars", CAR_ID), carRecalc);
        batch.update(doc(db, "groups", GROUP_ID), {
            spendByYear: { "2026": 500.5 },
        });

        await assertSucceeds(batch.commit());
    });

    /**
     * Recalculate must be able to DROP a year that no longer has any spend in
     * it — the log-write branch deliberately can't (isSpendUpdate pins prior
     * keys so a routine write can never wipe history), which is why the repair
     * is owner-only.
     */
    it("lets the owner drop a year bucket that no longer has spending", async () => {
        await assertSucceeds(
            updateDoc(groupRef(OWNER), { spendByYear: { "2026": 12 } }),
        );
    });

    /**
     * And the same on the car: a service type whose last entry was deleted has
     * to LEAVE `lastByType`, or next-due keeps counting from something gone.
     */
    it("lets the owner empty lastByType when a car has no history left", async () => {
        await assertSucceeds(
            updateDoc(carRef(OWNER), { totalSpend: 0, lastByType: {} }),
        );
    });
});

// ─────────────────────────────────────────── THE BOUNDARY, RE-ASSERTED

describe("Recalculate widens nothing [S4, S7]", () => {
    it("STOPS a view-only member rewriting a car's totals", async () => {
        await assertFails(updateDoc(carRef(MEMBER), carRecalc));
    });

    it("STOPS a non-member touching anything", async () => {
        await assertFails(updateDoc(carRef(STRANGER), carRecalc));
        await assertFails(
            updateDoc(groupRef(STRANGER), { spendByYear: { "2026": 0 } }),
        );
    });

    /**
     * A counter write is still its own branch. If a totals rewrite could carry
     * an access grant, "repair the numbers" would be a way to hand yourself
     * permissions — which is the whole reason these branches are separated.
     */
    it("STOPS a totals rewrite carrying an access grant", async () => {
        await assertFails(
            updateDoc(carRef(OWNER), {
                ...carRecalc,
                access: { [MEMBER]: "edit" },
            }),
        );
    });

    it("STOPS a totals rewrite carrying an odometer decrease", async () => {
        await assertFails(
            updateDoc(carRef(OWNER), { ...carRecalc, odometer: 1 }),
        );
    });

    /** `statusStamp` is T13's dedupe marker and has its own branch. */
    it("STOPS a totals rewrite carrying a status stamp", async () => {
        await assertFails(
            updateDoc(carRef(OWNER), { ...carRecalc, statusStamp: {} }),
        );
    });

    it("STOPS a negative total", async () => {
        await assertFails(updateDoc(carRef(OWNER), { totalSpend: -1 }));
    });

    /**
     * The group's identity can never ride along with a spend repair. Without
     * this, "recalculate" would be a shape that also rotates the invite token
     * or renames the group.
     */
    it("STOPS a spend rewrite rotating the invite token", async () => {
        await assertFails(
            updateDoc(groupRef(OWNER), {
                spendByYear: { "2026": 12 },
                joinToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            }),
        );
    });

    it("STOPS a spend rewrite changing who owns the group", async () => {
        await assertFails(
            updateDoc(groupRef(OWNER), {
                spendByYear: { "2026": 12 },
                ownerId: MEMBER,
            }),
        );
    });

    /**
     * A member with edit on the car can still move its totals — that is not a
     * hole, it is the log-write path (they are allowed to log a service, and
     * logging one moves the total in the same batch). Asserted so the
     * distinction is on the record: Recalculate is owner-only as a PRODUCT
     * decision about a heavy read, not as a security boundary the rules could
     * enforce.
     */
    it("still lets an edit holder move the totals — that's the log path", async () => {
        await assertSucceeds(updateDoc(carRef(CREATOR), carRecalc));
    });
});

// ────────────────────────────────────────────────────────── READS UNCHANGED

describe("the dashboard opens no new read path [S1, S2]", () => {
    /**
     * Every figure T14 renders comes off a document the app was already
     * listening to: `car.totalSpend` from the cars listener, `spendByYear`
     * from the group listener. A view-only member sees the money — spend is a
     * group question, like the history it comes from.
     */
    it("lets a view-only member read both counters", async () => {
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        const car = await assertSucceeds(
            getDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID)),
        );
        expect(car.data()?.totalSpend).toBe(999);

        const group = await assertSucceeds(getDoc(doc(db, "groups", GROUP_ID)));
        expect(group.data()?.spendByYear["2026"]).toBe(999);
    });

    it("STOPS a non-member reading either", async () => {
        const db = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(getDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID)));
        await assertFails(getDoc(doc(db, "groups", GROUP_ID)));
    });
});
