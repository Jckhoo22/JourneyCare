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
    deleteField,
    doc,
    getDocs,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Security-rules tests for the parts shelf. [T18, PRT1–PRT7]
 *
 * Every property PRT1–PRT7 encodes about the shape, transitions and access
 * of a `cars/{carId}/parts/{partId}` document. The install and revert
 * transitions are the interesting half: rules can enforce the shelf-side
 * shape, but the linkage to a real log in the same batch is invisible from
 * a rule (batches are evaluated per-write). That is documented in the rules
 * next to the transition helpers.
 */

const OWNER = "owner-uid";
const CREATOR = "creator-uid";
const GRANTED = "granted-uid";
const MEMBER = "member-uid";
const STRANGER = "stranger-uid";

const GROUP_ID = "family-car";
const CAR_ID = "myvi";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare-parts",
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

const partsRef = (
    db: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
) => collection(db.firestore(), "groups", GROUP_ID, "cars", CAR_ID, "parts");

const shelfPart = (uid: string, overrides: Record<string, unknown> = {}) => ({
    typeId: "engine_oil",
    cost: 65,
    purchaseDate: Timestamp.fromDate(new Date("2026-07-01T00:00:00")),
    status: "on_hand",
    createdBy: uid,
    createdAt: serverTimestamp(),
    ...overrides,
});

const seedPart = async (
    id = "part-1",
    overrides: Record<string, unknown> = {},
) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
            doc(
                context.firestore(),
                "groups",
                GROUP_ID,
                "cars",
                CAR_ID,
                "parts",
                id,
            ),
            {
                ...shelfPart(CREATOR),
                createdAt: new Date(),
                ...overrides,
            },
        );
    });
};

describe("parts reads — the view floor reaches the shelf [PRT2]", () => {
    it("lets any member read the shelf", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(MEMBER);
        await assertSucceeds(getDocs(partsRef(db)));
    });

    it("STOPS a non-member reading the shelf", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(STRANGER);
        await assertFails(getDocs(partsRef(db)));
    });
});

describe("parts writes — carEdit on the parent car [PRT1]", () => {
    it("lets the group owner add a part", async () => {
        const db = testEnv.authenticatedContext(OWNER);
        await assertSucceeds(addDoc(partsRef(db), shelfPart(OWNER)));
    });

    it("lets the car's creator add one", async () => {
        const db = testEnv.authenticatedContext(CREATOR);
        await assertSucceeds(addDoc(partsRef(db), shelfPart(CREATOR)));
    });

    it("lets a granted member add one", async () => {
        const db = testEnv.authenticatedContext(GRANTED);
        await assertSucceeds(addDoc(partsRef(db), shelfPart(GRANTED)));
    });

    it("STOPS a view-only member adding one", async () => {
        const db = testEnv.authenticatedContext(MEMBER);
        await assertFails(addDoc(partsRef(db), shelfPart(MEMBER)));
    });

    it("STOPS a non-member adding one", async () => {
        const db = testEnv.authenticatedContext(STRANGER);
        await assertFails(addDoc(partsRef(db), shelfPart(STRANGER)));
    });

    it("STOPS a fresh part carrying installedLogId or installed status [PRT7]", async () => {
        const db = testEnv.authenticatedContext(CREATOR);
        // A fresh part must be on the shelf with no linkage.
        await assertFails(
            addDoc(
                partsRef(db),
                shelfPart(CREATOR, { status: "installed", installedLogId: "x" }),
            ),
        );
        await assertFails(
            addDoc(partsRef(db), shelfPart(CREATOR, { installedLogId: "x" })),
        );
    });

    it("STOPS a forged createdBy on create", async () => {
        const db = testEnv.authenticatedContext(CREATOR);
        await assertFails(
            addDoc(partsRef(db), shelfPart(CREATOR, { createdBy: OWNER })),
        );
    });

    it("STOPS unknown fields riding along", async () => {
        const db = testEnv.authenticatedContext(CREATOR);
        await assertFails(
            addDoc(partsRef(db), shelfPart(CREATOR, { arbitrary: "junk" })),
        );
    });
});

describe("install transition on_hand → installed [PRT4, PRT7]", () => {
    it("accepts the flip when the log id is present and cost is unchanged", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        await assertSucceeds(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
                { status: "installed", installedLogId: "log-abc" },
            ),
        );
    });

    it("STOPS a flip that changes the cost — denorm was counted at install", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        await assertFails(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
                { status: "installed", installedLogId: "log-abc", cost: 999 },
            ),
        );
    });

    it("STOPS a flip that omits installedLogId", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        await assertFails(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
                { status: "installed" },
            ),
        );
    });

    it("STOPS a view-only member flipping the status", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(MEMBER).firestore();
        await assertFails(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
                { status: "installed", installedLogId: "log-abc" },
            ),
        );
    });
});

describe("revert transition installed → on_hand [PRT6]", () => {
    beforeEach(async () => {
        await seedPart("part-1", {
            status: "installed",
            installedLogId: "log-abc",
        });
    });

    it("accepts the revert when the linkage is cleared", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();
        // Delete the linkage; status flips back. Exactly what the client's
        // deleteLog batch does when it finds a linked part.
        await assertSucceeds(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
                { status: "on_hand", installedLogId: deleteField() },
            ),
        );
    });

    it("STOPS a revert that leaves installedLogId in place", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();
        // Setting status on_hand while keeping installedLogId is inconsistent
        // shape — the whole point of the revert is severing the link.
        await assertFails(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
                { status: "on_hand" },
            ),
        );
    });
});

describe("shelf edit (on_hand → on_hand) [Parts shelf redesign]", () => {
    it("lets an edit-holder change label + cost while on the shelf", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        // Cost is FREE to change while on the shelf — it enters the denorm
        // only at install (decision #25).
        await assertSucceeds(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
                { cost: 88, label: "Amsoil 5W-30 4L" },
            ),
        );
    });

    it("STOPS a shelf edit that reassigns createdBy", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(CREATOR).firestore();

        await assertFails(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
                { cost: 88, createdBy: OWNER },
            ),
        );
    });

    it("STOPS a view-only member editing a shelf part", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(MEMBER).firestore();

        await assertFails(
            updateDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
                { cost: 88 },
            ),
        );
    });
});

describe("delete a shelf part [PRT6]", () => {
    it("lets an edit-holder delete an on-hand part", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(CREATOR).firestore();
        await assertSucceeds(
            deleteDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
            ),
        );
    });

    it("STOPS a view-only member deleting", async () => {
        await seedPart();
        const db = testEnv.authenticatedContext(MEMBER).firestore();
        await assertFails(
            deleteDoc(
                doc(db, "groups", GROUP_ID, "cars", CAR_ID, "parts", "part-1"),
            ),
        );
    });
});
