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
    increment,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Security-rules tests for `groups/{gid}/cars`. [S4, C1, C6]
 *
 * The properties under test:
 *   • every member of a group can SEE every car in it — the view floor (C6);
 *   • only the owner and members the owner has listed can ADD one (C1);
 *   • a car arrives inert: no access granted, no history, no spend, and
 *     created by the person actually making the request.
 */

const OWNER = "owner-uid";
/** In the group AND listed in canAddCars. */
const ADDER = "adder-uid";
/** In the group, NOT listed in canAddCars. */
const MEMBER = "member-uid";
/** Not in the group at all. */
const STRANGER = "stranger-uid";

const GROUP_ID = "family-car";
const GROUP_NAME = "Family Car";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare-cars",
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
            name: GROUP_NAME,
            ownerId: OWNER,
            memberIds: [OWNER, ADDER, MEMBER],
            members: {
                [OWNER]: { username: "Owner", joinedAt: new Date() },
                [ADDER]: { username: "Adder", joinedAt: new Date() },
                [MEMBER]: { username: "Member", joinedAt: new Date() },
            },
            canAddCars: [OWNER, ADDER],
            joinToken: "0123456789abcdef0123456789abcdef",
            carCount: 0,
            createdAt: new Date(),
        });
    });
});

/** A syntactically valid JPEG data URL of roughly `chars` total length. */
const jpegDataUrl = (chars: number): string => {
    const prefix = "data:image/jpeg;base64,";
    return prefix + "A".repeat(Math.max(1, chars - prefix.length));
};

/** A well-formed car payload, exactly as useCarActions builds it. */
const carPayload = (uid: string, overrides: Record<string, unknown> = {}) => ({
    brand: "Perodua",
    model: "Myvi",
    year: 2018,
    nickname: "Mum's Myvi",
    plate: "WXY 1234",
    odometer: 128400,
    access: {},
    lastByType: {},
    statusStamp: {},
    totalSpend: 0,
    createdBy: uid,
    createdAt: serverTimestamp(),
    ...overrides,
});

const seedCar = async (carId = "myvi") => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
            doc(context.firestore(), "groups", GROUP_ID, "cars", carId),
            { ...carPayload(OWNER), createdAt: new Date() },
        );
    });
};

// ─────────────────────────────────────────────────────────────────── READS

describe("cars reads — the view floor [C6]", () => {
    it("lets the owner read a car", async () => {
        await seedCar();
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(getDoc(doc(db, "groups", GROUP_ID, "cars", "myvi")));
    });

    // The floor that matters: a member with NO car-adding rights and NO edit
    // access can still see every car. Membership alone buys visibility.
    it("lets a plain member read a car they can neither add nor edit", async () => {
        await seedCar();
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertSucceeds(getDoc(doc(db, "groups", GROUP_ID, "cars", "myvi")));
    });

    it("supports the group screen's list query [C10]", async () => {
        await seedCar("myvi");
        await seedCar("saga");
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        const result = await assertSucceeds(
            getDocs(collection(db, "groups", GROUP_ID, "cars")),
        );
        expect(result.size).toBe(2);
    });

    it("STOPS a non-member reading a car", async () => {
        await seedCar();
        const db = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(getDoc(doc(db, "groups", GROUP_ID, "cars", "myvi")));
    });

    it("STOPS a non-member listing the cars", async () => {
        await seedCar();
        const db = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(getDocs(collection(db, "groups", GROUP_ID, "cars")));
    });

    it("STOPS an unauthenticated visitor reading a car", async () => {
        await seedCar();
        const db = testEnv.unauthenticatedContext().firestore();

        await assertFails(getDoc(doc(db, "groups", GROUP_ID, "cars", "myvi")));
    });
});

// ──────────────────────────────────────────────────────────────── WHO ADDS

describe("cars create — who may add [C1]", () => {
    it("lets the group owner add a car", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            addDoc(collection(db, "groups", GROUP_ID, "cars"), carPayload(OWNER)),
        );
    });

    it("lets a member the owner listed in canAddCars add a car", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertSucceeds(
            addDoc(collection(db, "groups", GROUP_ID, "cars"), carPayload(ADDER)),
        );
    });

    // The case the UI hides but the server has to refuse: a legitimate member
    // of the group, who can read every car in it, and still may not add one.
    it("STOPS a member who isn't in canAddCars", async () => {
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertFails(
            addDoc(collection(db, "groups", GROUP_ID, "cars"), carPayload(MEMBER)),
        );
    });

    it("STOPS a non-member adding a car", async () => {
        const db = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(STRANGER),
            ),
        );
    });

    it("STOPS an unauthenticated visitor adding a car", async () => {
        const db = testEnv.unauthenticatedContext().firestore();

        await assertFails(
            addDoc(collection(db, "groups", GROUP_ID, "cars"), carPayload(OWNER)),
        );
    });

    it("STOPS adding a car to a group that doesn't exist", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            addDoc(collection(db, "groups", "no-such-group", "cars"), carPayload(OWNER)),
        );
    });
});

// ───────────────────────────────────────────────────────── WHAT MAY ARRIVE

describe("ATTACK: shaping a car by hand", () => {
    it("STOPS forging createdBy as someone else", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        // createdBy carries implicit edit rights (C6), so writing someone
        // else's uid there is handing them control of the car.
        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(ADDER, { createdBy: OWNER }),
            ),
        );
    });

    it("STOPS a car arriving with edit access already granted", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        // Granting edit is the owner's call, per car, in T11 — not something a
        // car-adder can smuggle in at creation.
        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(ADDER, { access: { [MEMBER]: "edit" } }),
            ),
        );
    });

    it("STOPS a car arriving with spend or history on it", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { totalSpend: 5000 }),
            ),
        );
        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, {
                    lastByType: { engine_oil: { date: new Date() } },
                }),
            ),
        );
        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { statusStamp: { engine_oil: "overdue" } }),
            ),
        );
    });

    it("STOPS unknown fields riding along", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { note: "arbitrary content" }),
            ),
        );
    });

    it("accepts a photo within the size guard [S6]", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { photo: jpegDataUrl(1000) }),
            ),
        );
    });

    it("STOPS an oversized photo [S6]", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        // The whole point of the guard: a document that would crowd out
        // Firestore's 1MB ceiling never lands.
        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { photo: jpegDataUrl(360000) }),
            ),
        );
    });

    // Without the prefix check the field is a 350KB slot for arbitrary text.
    it("STOPS a photo that isn't a JPEG data URL [S6]", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { photo: "x".repeat(5000) }),
            ),
        );
        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, {
                    photo: "https://example.com/not-a-data-url.jpg",
                }),
            ),
        );
    });

    it("STOPS a missing or oversized brand or model", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { brand: "" }),
            ),
        );
        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { model: "x".repeat(41) }),
            ),
        );
    });

    it("STOPS an implausible year", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { year: 1800 }),
            ),
        );
        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { year: "2018" }),
            ),
        );
    });

    it("STOPS a negative odometer", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            addDoc(
                collection(db, "groups", GROUP_ID, "cars"),
                carPayload(OWNER, { odometer: -1 }),
            ),
        );
    });

    it("accepts a car with only the required fields", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        // nickname, plate and odometer are all optional [C3].
        await assertSucceeds(
            addDoc(collection(db, "groups", GROUP_ID, "cars"), {
                brand: "Proton",
                model: "Saga",
                year: 2021,
                access: {},
                lastByType: {},
                statusStamp: {},
                totalSpend: 0,
                createdBy: OWNER,
                createdAt: serverTimestamp(),
            }),
        );
    });
});

// ──────────────────────────────────────────────────────── EDITING [C6, C8]

/**
 * `ADDER` created the seeded car, so they hold edit implicitly. `MEMBER` is in
 * the group with no edit at all — the case the view floor exists for.
 */
const seedCarBy = async (creator: string, extra: Record<string, unknown> = {}) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
            doc(context.firestore(), "groups", GROUP_ID, "cars", "myvi"),
            { ...carPayload(creator), createdAt: new Date(), ...extra },
        );
    });
};

describe("cars update — who may edit [C6, C8]", () => {
    it("lets the group owner edit any car", async () => {
        await seedCarBy(ADDER);
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                nickname: "The Myvi",
            }),
        );
    });

    it("lets the creator edit what they added", async () => {
        await seedCarBy(ADDER);
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                plate: "ABC 123",
            }),
        );
    });

    it("lets a member the owner elevated in the access map edit", async () => {
        await seedCarBy(ADDER, { access: { [MEMBER]: "edit" } });
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 200000,
            }),
        );
    });

    // The attack case the view floor makes possible: a legitimate member who
    // can READ every car and must not be able to change one.
    it("STOPS a member with no edit updating the odometer", async () => {
        await seedCarBy(ADDER);
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 200000,
            }),
        );
    });

    it("STOPS a member with no edit changing details or the photo", async () => {
        await seedCarBy(ADDER);
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                nickname: "Mine now",
            }),
        );
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                photo: jpegDataUrl(1000),
            }),
        );
    });

    it("STOPS a non-member editing anything", async () => {
        await seedCarBy(ADDER);
        const db = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 1,
            }),
        );
    });
});

describe("ATTACK: an edit reaching past the editable fields", () => {
    beforeEach(() => seedCarBy(ADDER));

    // Granting edit is the owner's call, per car, and lands in T11. An
    // edit-holder writing the access map would be handing out their own rights.
    it("STOPS an edit-holder granting access", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [MEMBER]: "edit" },
            }),
        );
    });

    // The owner CAN write the access map — but only through its own branch,
    // never bundled with a detail change. See the access-grid block below.
    it("STOPS the owner bundling an access change with anything else", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [MEMBER]: "edit" },
                odometer: 999999,
            }),
        );
    });

    /**
     * T12 gives the totals their own branch, because a log write has to move
     * them. What must NOT be possible is moving them from the DETAILS branch —
     * a rename or a photo change carrying a silent spend adjustment.
     */
    it("STOPS a detail edit carrying a spend or history change", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                nickname: "Renamed",
                totalSpend: 99999,
            }),
        );
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                photo: jpegDataUrl(1000),
                lastByType: { engine_oil: { date: new Date() } },
            }),
        );
    });

    it("STOPS the totals branch carrying anything else", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        // The reverse smuggle: totals are legitimate, the access grant is not.
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                totalSpend: 250,
                access: { [MEMBER]: "edit" },
            }),
        );
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                totalSpend: 250,
                nickname: "Renamed",
            }),
        );
    });

    it("STOPS a negative total", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                totalSpend: -1,
            }),
        );
    });

    it("STOPS reassigning who created the car", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        // createdBy carries implicit edit, so writing it is granting rights.
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                createdBy: MEMBER,
            }),
        );
    });

    it("STOPS an oversized photo on update [S6]", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                photo: jpegDataUrl(360000),
            }),
        );
    });

    it("STOPS an unknown field appearing on update", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                note: "arbitrary",
            }),
        );
    });
});

// ─────────────────────────────────────────── THE ACCESS GRID [C6, C7, T11]

/**
 * Granting and revoking per-car edit.
 *
 * The property: an edit-holder can change the car, but only the OWNER can
 * change who else may. That is the line between "can use this" and "can decide
 * who uses this", and it is the whole reason the access map gets its own rule
 * branch instead of riding along with the detail edit.
 */
describe("cars access map [C6, C7]", () => {
    beforeEach(() => seedCarBy(ADDER));

    it("lets the owner grant a member edit", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [MEMBER]: "edit" },
            }),
        );
    });

    it("lets the owner revoke it again", async () => {
        await seedCarBy(ADDER, { access: { [MEMBER]: "edit" } });
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: {},
            }),
        );
    });

    /**
     * The grant has to actually work — a rule that permits the write but leaves
     * the member unable to edit would pass every "allowed" test and still be
     * broken. So: grant, then have that member exercise the right.
     */
    it("a granted member can immediately edit the car", async () => {
        const owner = testEnv.authenticatedContext(OWNER).firestore();
        await updateDoc(doc(owner, "groups", GROUP_ID, "cars", "myvi"), {
            access: { [MEMBER]: "edit" },
        });

        const member = testEnv.authenticatedContext(MEMBER).firestore();
        await assertSucceeds(
            updateDoc(doc(member, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 200000,
            }),
        );
    });

    /**
     * And the revoke has to bite immediately — this is the in-flight case from
     * the task: the member still has the page open and their client still
     * thinks they can write.
     */
    it("a revoked member's next write bounces off the rules", async () => {
        await seedCarBy(ADDER, { access: { [MEMBER]: "edit" } });

        const member = testEnv.authenticatedContext(MEMBER).firestore();
        // They can edit right now...
        await assertSucceeds(
            updateDoc(doc(member, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 200000,
            }),
        );

        const owner = testEnv.authenticatedContext(OWNER).firestore();
        await updateDoc(doc(owner, "groups", GROUP_ID, "cars", "myvi"), {
            access: {},
        });

        // ...and the very next attempt is refused, whatever their UI believes.
        await assertFails(
            updateDoc(doc(member, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 210000,
            }),
        );
    });

    it("STOPS a non-owner granting access", async () => {
        // ADDER created this car and holds edit — still not their call.
        for (const uid of [ADDER, MEMBER, STRANGER]) {
            const db = testEnv.authenticatedContext(uid).firestore();
            await assertFails(
                updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                    access: { [MEMBER]: "edit" },
                }),
            );
        }
    });

    it("STOPS a member granting themselves edit", async () => {
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [MEMBER]: "edit" },
            }),
        );
    });

    it("STOPS granting access to someone outside the group", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [STRANGER]: "edit" },
            }),
        );
    });

    it("STOPS inventing an access grade", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        // 'edit' is the only value the map can carry; anything else would mean
        // the UI and the rules disagree about what it grants.
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [MEMBER]: "admin" },
            }),
        );
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [MEMBER]: true },
            }),
        );
    });

    /**
     * The owner and the creator hold edit implicitly. Writing them into the map
     * would create a second source of truth for something the document already
     * knows — and would imply the entry could be deleted to revoke them, which
     * C6 says it cannot.
     */
    it("STOPS writing the owner or the creator into the map", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [OWNER]: "edit" },
            }),
        );
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [ADDER]: "edit" },
            }),
        );
    });

    it("STOPS an access change smuggling in another field", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        // The diff IS the check — this is what plan.md's field-level
        // affectedKeys requirement buys.
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [MEMBER]: "edit" },
                nickname: "Mine now",
            }),
        );
        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                access: { [MEMBER]: "edit" },
                totalSpend: 9999,
            }),
        );
    });

    it("commits the grant and its notification together [N6]", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        const batch = writeBatch(db);
        batch.update(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
            access: { [MEMBER]: "edit" },
        });
        batch.set(doc(db, "notifications", MEMBER, "items", "n1"), {
            type: "access_changed",
            payload: {
                groupId: GROUP_ID,
                groupName: GROUP_NAME,
                // T15: the notification opens the car it names.
                carId: "myvi",
                carName: "Mum's Myvi",
                granted: true,
            },
            read: false,
            createdAt: serverTimestamp(),
        });

        await assertSucceeds(batch.commit());
    });
});

// ────────────────────────────────────────────────── ODOMETER, MONOTONIC [C9]

describe("odometer only runs forward [C9]", () => {
    // The seeded car reads 128,400.
    beforeEach(() => seedCarBy(ADDER));

    it("accepts a higher reading", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 130000,
            }),
        );
    });

    it("accepts a dated reading that matches the odometer", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();
        await assertSucceeds(updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
            odometer: 130000,
            odometerReading: { value: 130000, at: serverTimestamp() },
        }));
    });

    it("requires a dated reading to match the odometer", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();
        await assertFails(updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
            odometer: 130000,
            odometerReading: { value: 128400, at: serverTimestamp() },
        }));
    });

    it("STOPS a lower reading with nothing to say it was deliberate", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 1000,
            }),
        );
    });

    it("accepts a lower reading stamped as a correction", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 1000,
                odometerCorrectedAt: serverTimestamp(),
            }),
        );
    });

    // The stamp has to be the server's time, or it means nothing.
    it("STOPS a correction stamped with a time of the client's choosing", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 1000,
                odometerCorrectedAt: new Date("2020-01-01"),
            }),
        );
    });

    // Otherwise the field stops meaning "this was corrected".
    it("STOPS stamping a correction on an increase", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertFails(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 130000,
                odometerCorrectedAt: serverTimestamp(),
            }),
        );
    });

    it("lets a car with no reading yet be given any value", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(
                doc(context.firestore(), "groups", GROUP_ID, "cars", "fresh"),
                {
                    brand: "Proton",
                    model: "Saga",
                    year: 2021,
                    access: {},
                    lastByType: {},
                    statusStamp: {},
                    totalSpend: 0,
                    createdBy: ADDER,
                    createdAt: new Date(),
                },
            );
        });

        const db = testEnv.authenticatedContext(ADDER).firestore();
        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "fresh"), {
                odometer: 40000,
            }),
        );
    });
});

// ──────────────────────────────────────────────────────────── DELETE [C8]

describe("cars delete [C8]", () => {
    beforeEach(() => seedCarBy(ADDER));

    it("lets the group owner delete any car", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        await assertSucceeds(
            deleteDoc(doc(db, "groups", GROUP_ID, "cars", "myvi")),
        );
    });

    it("lets the creator delete what they added", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertSucceeds(
            deleteDoc(doc(db, "groups", GROUP_ID, "cars", "myvi")),
        );
    });

    // Deleting takes the whole maintenance history with it, which is a bigger
    // act than editing one field — so edit alone isn't enough.
    it("STOPS an elevated edit-holder who is neither owner nor creator", async () => {
        await seedCarBy(ADDER, { access: { [MEMBER]: "edit" } });
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        // They can edit it...
        await assertSucceeds(
            updateDoc(doc(db, "groups", GROUP_ID, "cars", "myvi"), {
                odometer: 200000,
            }),
        );
        // ...and still cannot delete it.
        await assertFails(
            deleteDoc(doc(db, "groups", GROUP_ID, "cars", "myvi")),
        );
    });

    it("STOPS a plain member and a non-member deleting", async () => {
        for (const uid of [MEMBER, STRANGER]) {
            const db = testEnv.authenticatedContext(uid).firestore();
            await assertFails(
                deleteDoc(doc(db, "groups", GROUP_ID, "cars", "myvi")),
            );
        }
    });

    it("deletes the car and the group counter together [P3a]", async () => {
        const db = testEnv.authenticatedContext(OWNER).firestore();

        const batch = writeBatch(db);
        batch.delete(doc(db, "groups", GROUP_ID, "cars", "myvi"));
        batch.update(doc(db, "groups", GROUP_ID), { carCount: increment(-1) });

        await assertSucceeds(batch.commit());
    });
});

// ─────────────────────────────────────── THE LOG CASCADE'S RULES [C8, T12]

describe("logs — only what the car-delete cascade needs [C8]", () => {
    beforeEach(async () => {
        await seedCarBy(ADDER);
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(
                doc(
                    context.firestore(),
                    "groups", GROUP_ID, "cars", "myvi", "logs", "log-1",
                ),
                { type: "engine_oil", cost: 250, date: new Date() },
            );
        });
    });

    it("lets any group member read logs — the view floor extends to them", async () => {
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertSucceeds(
            getDocs(collection(db, "groups", GROUP_ID, "cars", "myvi", "logs")),
        );
    });

    it("STOPS a non-member reading logs", async () => {
        const db = testEnv.authenticatedContext(STRANGER).firestore();

        await assertFails(
            getDocs(collection(db, "groups", GROUP_ID, "cars", "myvi", "logs")),
        );
    });

    it("lets an edit-holder delete a log, so the cascade can run", async () => {
        const db = testEnv.authenticatedContext(ADDER).firestore();

        await assertSucceeds(
            deleteDoc(
                doc(db, "groups", GROUP_ID, "cars", "myvi", "logs", "log-1"),
            ),
        );
    });

    it("STOPS a member with no edit deleting a log", async () => {
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertFails(
            deleteDoc(
                doc(db, "groups", GROUP_ID, "cars", "myvi", "logs", "log-1"),
            ),
        );
    });

    // T12 brings shape validation and the denormalisation batch. Until then,
    // writing a log is not a thing anyone can do.
    it("STOPS everyone creating a log before T12", async () => {
        for (const uid of [OWNER, ADDER, MEMBER]) {
            const db = testEnv.authenticatedContext(uid).firestore();
            await assertFails(
                setDoc(
                    doc(db, "groups", GROUP_ID, "cars", "myvi", "logs", "new"),
                    { type: "engine_oil", cost: 100, date: new Date() },
                ),
            );
        }
    });
});

// ─────────────────────────────────────────────────────── THE REAL BATCH

describe("the real add-car batch [P3a]", () => {
    /** Mirrors useCarActions.createCar exactly: car + counter, one batch. */
    const addCarBatch = (uid: string) => {
        const db = testEnv.authenticatedContext(uid).firestore();
        const batch = writeBatch(db);
        batch.set(
            doc(db, "groups", GROUP_ID, "cars", `car-${uid}`),
            carPayload(uid),
        );
        batch.update(doc(db, "groups", GROUP_ID), { carCount: increment(1) });
        return batch;
    };

    it("commits the car and the group's carCount together", async () => {
        await assertSucceeds(addCarBatch(OWNER).commit());
    });

    it("works for a canAddCars member, who must move the group counter too", async () => {
        // The reason members need a carCount branch in the groups update rule
        // at all: without it, only the owner could ever complete this batch.
        await assertSucceeds(addCarBatch(ADDER).commit());
    });

    it("STOPS a member without car-adding rights running the same batch", async () => {
        await assertFails(addCarBatch(MEMBER).commit());
    });

    it("works on a group created before carCount existed", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "groups", "legacy"), {
                name: "Legacy",
                ownerId: OWNER,
                memberIds: [OWNER],
                members: { [OWNER]: { username: "Owner", joinedAt: new Date() } },
                canAddCars: [OWNER],
                joinToken: "0123456789abcdef0123456789abcdef",
                createdAt: new Date(),
                // no carCount — the field postdates this group
            });
        });

        const db = testEnv.authenticatedContext(OWNER).firestore();
        const batch = writeBatch(db);
        batch.set(doc(db, "groups", "legacy", "cars", "first"), carPayload(OWNER));
        batch.update(doc(db, "groups", "legacy"), { carCount: increment(1) });

        await assertSucceeds(batch.commit());
    });
});
