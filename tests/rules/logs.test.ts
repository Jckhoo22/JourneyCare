import { readFileSync } from "node:fs";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
    Timestamp,
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    increment,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Security-rules tests for maintenance logs. [L1–L6, S1]
 *
 * The properties under test:
 *   • every group member can READ a car's history — the view floor extends to
 *     it, because "what has this cost us" is a group question;
 *   • only someone with edit on the PARENT CAR can write one;
 *   • an entry can never lie about who recorded it;
 *   • the denormalised totals move only through their own branch, and only for
 *     someone who could have written the log in the first place.
 */

const OWNER = "owner-uid";
/** Holds edit on the car by having created it. */
const CREATOR = "creator-uid";
/** In the group, granted edit on the car by the owner. */
const GRANTED = "granted-uid";
/** In the group, no edit at all — the view floor case. */
const MEMBER = "member-uid";
const STRANGER = "stranger-uid";

const GROUP_ID = "family-car";
const CAR_ID = "myvi";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare-logs",
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
            memberIds: [OWNER, CREATOR, GRANTED, MEMBER],
            members: {
                [OWNER]: { username: "Owner", joinedAt: new Date() },
                [CREATOR]: { username: "Creator", joinedAt: new Date() },
                [GRANTED]: { username: "Granted", joinedAt: new Date() },
                [MEMBER]: { username: "Member", joinedAt: new Date() },
            },
            canAddCars: [OWNER, CREATOR],
            joinToken: "0123456789abcdef0123456789abcdef",
            carCount: 1,
            spendByYear: { "2026": 0 },
            createdAt: new Date(),
        });

        await setDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
            brand: "Perodua",
            model: "Myvi",
            year: 2018,
            odometer: 128400,
            access: { [GRANTED]: "edit" },
            lastByType: {},
            statusStamp: {},
            totalSpend: 0,
            createdBy: CREATOR,
            createdAt: new Date(),
        });
    });
});

const logsRef = (db: ReturnType<RulesTestEnvironment["authenticatedContext"]>) =>
    collection(db.firestore(), "groups", GROUP_ID, "cars", CAR_ID, "logs");

/** A well-formed entry, exactly as useLogActions builds it. */
const logPayload = (uid: string, overrides: Record<string, unknown> = {}) => ({
    type: "engine_oil",
    cost: 250.5,
    date: Timestamp.fromDate(new Date("2026-07-01T00:00:00")),
    odometer: 128400,
    intervalKm: 10000,
    intervalMonths: 6,
    notes: "Local workshop",
    createdBy: { uid, username: "Someone" },
    createdAt: serverTimestamp(),
    ...overrides,
});

const seedLog = async (id = "log-1", overrides: Record<string, unknown> = {}) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
            doc(context.firestore(), "groups", GROUP_ID, "cars", CAR_ID, "logs", id),
            { ...logPayload(CREATOR), createdAt: new Date(), ...overrides },
        );
    });
};

// ────────────────────────────────────────────────────────────────── READS

describe("log reads — the view floor reaches the history [L6]", () => {
    it("lets a member with no edit read the history", async () => {
        await seedLog();
        const db = testEnv.authenticatedContext(MEMBER);

        const result = await assertSucceeds(getDocs(logsRef(db)));
        expect(result.size).toBe(1);
    });

    it("supports the car page's newest-first page query [L6]", async () => {
        await seedLog("a");
        await seedLog("b");
        const db = testEnv.authenticatedContext(MEMBER);

        await assertSucceeds(
            getDocs(query(logsRef(db), orderBy("date", "desc"), limit(25))),
        );
    });

    it("STOPS a non-member reading the history", async () => {
        await seedLog();
        const db = testEnv.authenticatedContext(STRANGER);

        await assertFails(getDocs(logsRef(db)));
    });
});

// ─────────────────────────────────────────────────────────── WHO MAY WRITE

describe("log writes — carEdit on the PARENT car [L1, L5]", () => {
    it("lets the group owner add an entry", async () => {
        const db = testEnv.authenticatedContext(OWNER);
        await assertSucceeds(addDoc(logsRef(db), logPayload(OWNER)));
    });

    it("lets the car's creator add one", async () => {
        const db = testEnv.authenticatedContext(CREATOR);
        await assertSucceeds(addDoc(logsRef(db), logPayload(CREATOR)));
    });

    it("lets a member the owner granted edit add one", async () => {
        const db = testEnv.authenticatedContext(GRANTED);
        await assertSucceeds(addDoc(logsRef(db), logPayload(GRANTED)));
    });

    /**
     * The attack case the view floor creates: a legitimate member who can READ
     * the whole history and must not be able to add to it.
     */
    it("STOPS a member with no edit adding an entry", async () => {
        const db = testEnv.authenticatedContext(MEMBER);
        await assertFails(addDoc(logsRef(db), logPayload(MEMBER)));
    });

    it("STOPS a member with no edit editing or deleting one", async () => {
        await seedLog();
        const db = testEnv.authenticatedContext(MEMBER).firestore();
        const ref = doc(db, "groups", GROUP_ID, "cars", CAR_ID, "logs", "log-1");

        await assertFails(updateDoc(ref, { cost: 0 }));
        await assertFails(deleteDoc(ref));
    });

    it("STOPS a non-member writing anything", async () => {
        const db = testEnv.authenticatedContext(STRANGER);
        await assertFails(addDoc(logsRef(db), logPayload(STRANGER)));
    });

    /**
     * Revoking edit has to reach the logs too — otherwise access is revoked on
     * the car and quietly retained on its history.
     */
    it("a revoked member can no longer write logs", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();
        await updateDoc(doc(owner, "groups", GROUP_ID, "cars", CAR_ID), {
            access: {},
        });

        const db = testEnv.authenticatedContext(GRANTED);
        await assertFails(addDoc(logsRef(db), logPayload(GRANTED)));
    });
});

// ───────────────────────────────────────────────────── WHAT MAY BE WRITTEN

describe("ATTACK: shaping a log entry by hand", () => {
    it("STOPS forging who recorded it [L5]", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        // The username shows in the history, so a forged createdBy puts words
        // in someone else's mouth about money that was spent.
        await assertFails(
            addDoc(logsRef(db), logPayload(CREATOR, {
                createdBy: { uid: OWNER, username: "Owner" },
            })),
        );
    });

    it("STOPS reassigning attribution on an edit", async () => {
        await seedLog();
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "logs", "log-1"),
                { createdBy: { uid: OWNER, username: "Owner" } },
            ),
        );
    });

    it("STOPS a negative cost, and allows zero [L2]", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertFails(addDoc(logsRef(db), logPayload(CREATOR, { cost: -1 })));
        // Zero is legitimate — warranty work, or a favour.
        await assertSucceeds(addDoc(logsRef(db), logPayload(CREATOR, { cost: 0 })));
    });

    it("STOPS a service dated in the future [L2]", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        await assertFails(
            addDoc(logsRef(db), logPayload(CREATOR, {
                date: Timestamp.fromDate(tomorrow),
            })),
        );
    });

    it("accepts a service dated today", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        // The common case, and the one a naive `< now` check gets wrong: the
        // client sends LOCAL midnight, which is always already past.
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);

        await assertSucceeds(
            addDoc(logsRef(db), logPayload(CREATOR, {
                date: Timestamp.fromDate(midnight),
            })),
        );
    });

    it("STOPS unknown fields riding along", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertFails(
            addDoc(logsRef(db), logPayload(CREATOR, { invoice: "arbitrary" })),
        );
    });

    it("STOPS a wall of text in the notes", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertFails(
            addDoc(logsRef(db), logPayload(CREATOR, { notes: "x".repeat(501) })),
        );
    });

    it("STOPS a nonsensical interval [L4]", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertFails(
            addDoc(logsRef(db), logPayload(CREATOR, { intervalKm: 0 })),
        );
        await assertFails(
            addDoc(logsRef(db), logPayload(CREATOR, { intervalMonths: -6 })),
        );
    });

    it("accepts an entry with no interval at all [L4]", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        // "none" is one of the four choices, and Custom starts there.
        const { intervalKm: _km, intervalMonths: _months, ...noInterval } =
            logPayload(CREATOR);
        await assertSucceeds(addDoc(logsRef(db), noInterval));
    });

    it("accepts a minimal entry — type, cost, date, attribution", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertSucceeds(
            addDoc(logsRef(db), {
                type: "custom",
                customLabel: "New bulb",
                cost: 12,
                date: Timestamp.fromDate(new Date("2026-07-01T00:00:00")),
                createdBy: { uid: CREATOR, username: "Creator" },
                createdAt: serverTimestamp(),
            }),
        );
    });
});

// ────────────────────────────────────────── THE DENORMALISATION [S1, S2]

/**
 * The totals a log write maintains.
 *
 * Worth being precise about what these tests prove. Rules evaluate each write
 * in a batch independently, so NONE of them can show that a totals change was
 * caused by a real log — that linkage is not expressible in Firestore rules
 * (the same wall `carCount` hit in T9). What they do prove is the part that
 * IS enforceable: who may move the totals, and that moving them can't carry
 * anything else along.
 */
describe("the log batch's denormalised fields [S1, S2]", () => {
    /** Exactly what useLogActions.createLog commits. */
    const createBatch = (uid: string) => {
        const db = testEnv.authenticatedContext(uid).firestore();
        const batch = writeBatch(db);

        batch.set(
            doc(db, "groups", GROUP_ID, "cars", CAR_ID, "logs", `log-${uid}`),
            logPayload(uid, { createdBy: { uid, username: "Someone" } }),
        );
        batch.update(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
            totalSpend: increment(250.5),
            "lastByType.engine_oil": {
                date: Timestamp.fromDate(new Date("2026-07-01T00:00:00")),
                odometer: 128400,
                intervalKm: 10000,
                intervalMonths: 6,
            },
        });
        batch.update(doc(db, "groups", GROUP_ID), {
            "spendByYear.2026": increment(250.5),
        });

        return batch;
    };

    it("commits the log, the car's totals and the group's spend together", async () => {
        await assertSucceeds(createBatch(CREATOR).commit());
    });

    it("works for a granted member too", async () => {
        await assertSucceeds(createBatch(GRANTED).commit());
    });

    it("STOPS a member with no edit running the same batch", async () => {
        await assertFails(createBatch(MEMBER).commit());
    });

    /**
     * The closest enforceable form of "no standalone counter tampering": a
     * view-only member cannot touch the totals at all, on any path.
     */
    it("STOPS a member with no edit touching the car's totals alone", async () => {
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
                totalSpend: 99999,
            }),
        );
    });

    it("STOPS a non-member touching the group's spend", async () => {
        const db = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID), {
                "spendByYear.2026": 99999,
            }),
        );
    });

    it("STOPS a spend change carrying a rename or a membership change", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID), {
                "spendByYear.2026": increment(100),
                name: "Renamed mid-spend",
            }),
        );
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID), {
                "spendByYear.2026": increment(100),
                memberIds: [OWNER, CREATOR, GRANTED, MEMBER, STRANGER],
            }),
        );
    });

    it("STOPS dropping a year's bucket", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        // Buckets accumulate; erasing one would erase a year of history from
        // the dashboard without touching a single log.
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID), {
                spendByYear: { "2025": 10 },
            }),
        );
    });

    it("STOPS rewriting three or more years at once", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        // One year for a create or delete, two for a date edit that crosses a
        // boundary. Three is not a thing any log mutation does.
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID), {
                spendByYear: { "2026": 1, "2027": 2, "2028": 3, "2029": 4 },
            }),
        );
    });

    it("allows the two-year move a date edit across a boundary makes", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID), {
                "spendByYear.2026": increment(-250.5),
                "spendByYear.2025": increment(250.5),
            }),
        );
    });

    it("keeps the odometer's monotonic guard on the log path [C9]", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        // Logging a service is when people update the reading, so the log
        // batch may move it — forwards, under the same rule as a manual edit.
        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
                totalSpend: increment(250),
                odometer: 130000,
            }),
        );
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
                totalSpend: increment(250),
                odometer: 1000,
            }),
        );
    });

    it("accepts the new spend maps riding the log batch [V2, SPD1]", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
                totalSpend: increment(200),
                "spendByType.engine_oil": increment(200),
            }),
        );
        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID), {
                "spendByYear.2026": increment(200),
                "spendByMonth.2026-07": increment(200),
            }),
        );
    });

    it("STOPS a member with no edit touching spendByType [SPD1]", async () => {
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
                "spendByType.engine_oil": 99999,
            }),
        );
    });

    it("STOPS a spendByMonth rewrite dropping a bucket [SPD1]", async () => {
        // Seed a two-month prior state so the drop attempt has something to
        // actually drop.
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await updateDoc(doc(context.firestore(), "groups", GROUP_ID), {
                spendByMonth: { "2026-07": 100, "2026-06": 50 },
            });
        });

        const db = testEnv.authenticatedContext(CREATOR).firestore();
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID), {
                spendByMonth: { "2026-07": 200 }, // drops 2026-06
            }),
        );
    });

    it("STOPS rewriting three months at once [SPD1]", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID), {
                spendByMonth: {
                    "2026-07": 1,
                    "2026-08": 2,
                    "2026-09": 3,
                },
            }),
        );
    });
});

// ─────────────────────────────────────────────── MULTI-ITEM VISIT [V1, V2, V5]

describe("multi-item visit — N logs in one batch [V1, V2, V5]", () => {
    /**
     * A visit's shape as `createVisit` commits it: N log docs + one car
     * update + one group update, all in one batch. The rules accept this
     * because they evaluate each write independently — N `logs/{id}` creates
     * share one `isLogDenormalisation` on the car and one `isSpendUpdate` on
     * the group.
     */
    const visitBatch = (uid: string, items: number, sameType = false) => {
        const db = testEnv.authenticatedContext(uid).firestore();
        const batch = writeBatch(db);
        const totalCost = 250.5 * items;
        const stamp = Timestamp.fromDate(new Date("2026-07-15T00:00:00"));

        // The types the visit touches. All-same-type stresses the
        // last-wins-on-lastByType tiebreak (G-D).
        for (let i = 0; i < items; i += 1) {
            const type = sameType ? "engine_oil" : i === 0 ? "engine_oil" : "brake_pads";
            batch.set(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "logs", `visit-${uid}-${i}`),
                logPayload(uid, {
                    type,
                    createdBy: { uid, username: "Someone" },
                    date: stamp,
                    odometer: 130000,
                }),
            );
        }

        // The car update is the SUM across items, plus lastByType for the
        // types the visit touched.
        batch.update(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
            totalSpend: increment(totalCost),
            "spendByType.engine_oil": increment(sameType ? totalCost : 250.5),
            ...(sameType
                ? {}
                : { "spendByType.brake_pads": increment(totalCost - 250.5) }),
            "lastByType.engine_oil": {
                date: stamp,
                odometer: 130000,
                intervalKm: 10000,
                intervalMonths: 6,
            },
            odometer: 130000,
        });
        batch.update(doc(db, "groups", GROUP_ID), {
            "spendByYear.2026": increment(totalCost),
            "spendByMonth.2026-07": increment(totalCost),
        });

        return batch;
    };

    it("accepts a 3-item visit — the T17 batch shape [V1, V2]", async () => {
        await assertSucceeds(visitBatch(CREATOR, 3).commit());
    });

    it("accepts a visit with two items of the SAME type — G-D tiebreak", async () => {
        // The G-D case: two engine-oil entries in one visit. Later item wins
        // lastByType. Both items still land as their own log docs.
        await assertSucceeds(visitBatch(CREATOR, 2, true).commit());
    });

    it("STOPS a view-only member running a visit batch", async () => {
        await assertFails(visitBatch(MEMBER, 2).commit());
    });

    it("STOPS a non-member running a visit batch", async () => {
        await assertFails(visitBatch(STRANGER, 2).commit());
    });
});
