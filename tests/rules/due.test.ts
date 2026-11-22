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
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Security-rules tests for next-due reminders. [R4]
 *
 * Two write paths arrive with T13, and they only make sense together:
 *
 *   cars/{carId}.statusStamp   — the dedupe marker, its own narrow branch
 *   notifications/…/items      — the due_soon / overdue shape
 *
 * The properties under test:
 *   • a reminder can only be SENT by someone with edit on the car, so a
 *     view-only member cannot manufacture notifications for other people;
 *   • a reminder can only be RECEIVED by someone with edit on the car — R4's
 *     "can view" narrowed deliberately, see spec.md;
 *   • sender and recipient may be the same person, unlike every other
 *     notification type in this app;
 *   • the stamp branch can carry nothing else — no odometer, no spend, no
 *     access grant riding along with it.
 */

const OWNER = "owner-uid";
/** Holds edit on the car by having created it. */
const CREATOR = "creator-uid";
/** In the group, granted edit on the car by the owner. */
const GRANTED = "granted-uid";
/** In the group, no edit on the car — the view-only case. */
const MEMBER = "member-uid";
const STRANGER = "stranger-uid";

const GROUP_ID = "family-car";
const GROUP_NAME = "Family Car";
const CAR_ID = "myvi";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: "demo-journeycare-due",
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
            lastByType: {
                engine_oil: {
                    date: new Date("2025-11-01T00:00:00"),
                    odometer: 118400,
                    intervalKm: 10000,
                    intervalMonths: 6,
                },
            },
            statusStamp: {},
            totalSpend: 0,
            createdBy: CREATOR,
            createdAt: new Date(),
        });
    });
});

const carRef = (db: ReturnType<RulesTestEnvironment["authenticatedContext"]>) =>
    doc(db.firestore(), "groups", GROUP_ID, "cars", CAR_ID);

/** Exactly what dueNotification() in src/model/Notification.ts builds. */
const duePayload = (overrides: Record<string, unknown> = {}) => ({
    type: "overdue",
    payload: {
        groupId: GROUP_ID,
        groupName: GROUP_NAME,
        carId: CAR_ID,
        carName: "Perodua Myvi",
        typeLabel: "Engine oil",
        dueLabel: "Due by 1 May 2026 or at 128,400 km",
    },
    read: false,
    createdAt: serverTimestamp(),
    ...overrides,
});

const sendTo = (
    sender: string,
    recipient: string,
    overrides: Record<string, unknown> = {},
) =>
    setDoc(
        doc(
            testEnv.authenticatedContext(sender).firestore(),
            "notifications",
            recipient,
            "items",
            "note-1",
        ),
        duePayload(overrides),
    );

// ──────────────────────────────────────────────────────── the stamp branch

describe("statusStamp — the dedupe marker [R4]", () => {
    it("lets the car's creator stamp a type", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertSucceeds(
            updateDoc(carRef(db), { statusStamp: { engine_oil: "overdue" } }),
        );
    });

    it("lets the group owner stamp", async () => {
        const db = testEnv.authenticatedContext(OWNER);

        await assertSucceeds(
            updateDoc(carRef(db), { statusStamp: { engine_oil: "due_soon" } }),
        );
    });

    it("lets a granted edit-holder stamp", async () => {
        const db = testEnv.authenticatedContext(GRANTED);

        await assertSucceeds(
            updateDoc(carRef(db), { statusStamp: { engine_oil: "overdue" } }),
        );
    });

    /** Recovery: the whole map is rewritten, so a cleared type simply leaves. */
    it("accepts an empty map, which is how a recovered type is cleared", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertSucceeds(updateDoc(carRef(db), { statusStamp: {} }));
    });

    it("DENIES a view-only member — nothing to suppress, nothing to move", async () => {
        const db = testEnv.authenticatedContext(MEMBER);

        await assertFails(
            updateDoc(carRef(db), { statusStamp: { engine_oil: "overdue" } }),
        );
    });

    it("DENIES someone outside the group entirely", async () => {
        const db = testEnv.authenticatedContext(STRANGER);

        await assertFails(
            updateDoc(carRef(db), { statusStamp: { engine_oil: "overdue" } }),
        );
    });

    it("DENIES a status value outside the two the app writes", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertFails(
            updateDoc(carRef(db), { statusStamp: { engine_oil: "urgent" } }),
        );
    });

    /**
     * The point of giving the stamp its own branch: it must not become a way
     * to move anything else. Each of these is a legitimate field that a
     * legitimate branch handles — just not this one.
     */
    it("DENIES a stamp update that also moves the odometer", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertFails(
            updateDoc(carRef(db), {
                statusStamp: { engine_oil: "overdue" },
                odometer: 140000,
            }),
        );
    });

    it("DENIES a stamp update that also rewrites the spend", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertFails(
            updateDoc(carRef(db), {
                statusStamp: { engine_oil: "overdue" },
                totalSpend: 9999,
            }),
        );
    });

    it("DENIES a stamp update that also grants access", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertFails(
            updateDoc(carRef(db), {
                statusStamp: { engine_oil: "overdue" },
                access: { [GRANTED]: "edit", [MEMBER]: "edit" },
            }),
        );
    });

    it("DENIES a stamp update that also rewrites the service history", async () => {
        const db = testEnv.authenticatedContext(CREATOR);

        await assertFails(
            updateDoc(carRef(db), {
                statusStamp: { engine_oil: "overdue" },
                lastByType: {},
            }),
        );
    });
});

// ─────────────────────────────────────────────────── the notification shape

describe("due_soon / overdue notifications [R4]", () => {
    it("lets an edit-holder notify THEMSELVES", async () => {
        // The common case: one person holds edit, and excluding the detector
        // would mean nobody is ever told.
        await assertSucceeds(sendTo(CREATOR, CREATOR));
    });

    it("lets an edit-holder notify another edit-holder", async () => {
        await assertSucceeds(sendTo(CREATOR, GRANTED));
    });

    it("lets an edit-holder notify the group owner, who holds edit implicitly", async () => {
        await assertSucceeds(sendTo(GRANTED, OWNER));
    });

    it("accepts due_soon as well as overdue", async () => {
        await assertSucceeds(sendTo(CREATOR, CREATOR, { type: "due_soon" }));
    });

    /**
     * R4 as drafted said "cars the user can view". This is the narrowing:
     * a reminder you have no permission to act on is noise.
     */
    it("DENIES a reminder addressed to a view-only member", async () => {
        await assertFails(sendTo(CREATOR, MEMBER));
    });

    it("DENIES a reminder addressed to someone outside the group", async () => {
        await assertFails(sendTo(CREATOR, STRANGER));
    });

    it("DENIES a view-only member SENDING one to an edit-holder", async () => {
        await assertFails(sendTo(MEMBER, CREATOR));
    });

    it("DENIES a stranger sending one", async () => {
        await assertFails(sendTo(STRANGER, CREATOR));
    });

    it("DENIES a group name that isn't the group's", async () => {
        await assertFails(
            sendTo(CREATOR, CREATOR, {
                payload: {
                    ...duePayload().payload,
                    groupName: "Something Else",
                },
            }),
        );
    });

    it("DENIES a car that doesn't exist", async () => {
        await assertFails(
            sendTo(CREATOR, CREATOR, {
                payload: { ...duePayload().payload, carId: "no-such-car" },
            }),
        );
    });

    it("DENIES a payload carrying an extra key", async () => {
        await assertFails(
            sendTo(CREATOR, CREATOR, {
                payload: { ...duePayload().payload, url: "http://evil" },
            }),
        );
    });

    it("DENIES a payload missing the due wording", async () => {
        const { dueLabel: _dropped, ...rest } = duePayload().payload;

        await assertFails(sendTo(CREATOR, CREATOR, { payload: rest }));
    });

    /** The bound is what stops the field being used to deliver a wall of text. */
    it("DENIES an oversized due label", async () => {
        await assertFails(
            sendTo(CREATOR, CREATOR, {
                payload: { ...duePayload().payload, dueLabel: "x".repeat(200) },
            }),
        );
    });

    it("DENIES one that arrives already read", async () => {
        await assertFails(sendTo(CREATOR, CREATOR, { read: true }));
    });

    /**
     * The types are not interchangeable: a due payload cannot be smuggled in
     * under a type whose own shape it doesn't satisfy.
     */
    it("DENIES a due payload sent under an unrelated type", async () => {
        await assertFails(
            sendTo(CREATOR, CREATOR, { type: "request_accepted" }),
        );
    });

    it("DENIES a due type carrying somebody else's payload shape", async () => {
        await assertFails(
            sendTo(CREATOR, CREATOR, {
                payload: {
                    groupId: GROUP_ID,
                    groupName: GROUP_NAME,
                    username: "Creator",
                },
            }),
        );
    });
});

// ────────────────────────────────────────────────────────── the real batch

describe("the transition batch, as the app actually writes it", () => {
    /**
     * One commit: a notification for every edit-holder, plus the stamp that
     * stops it happening again. If either half were refused the whole batch
     * fails, which is the guarantee — a stamp never moves without its
     * reminder, and a reminder never arrives without its stamp.
     */
    it("writes notifications and the stamp together", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();
        const batch = writeBatch(db);

        [OWNER, CREATOR, GRANTED].forEach((uid) => {
            batch.set(
                doc(collection(db, "notifications", uid, "items")),
                duePayload(),
            );
        });

        batch.update(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
            statusStamp: { engine_oil: "overdue" },
        });

        await assertSucceeds(batch.commit());
    });

    it("fails the WHOLE batch when one recipient can't be written to", async () => {
        const db = testEnv.authenticatedContext(CREATOR).firestore();
        const batch = writeBatch(db);

        // MEMBER has no edit on the car, so this half is refused...
        batch.set(
            doc(collection(db, "notifications", MEMBER, "items")),
            duePayload(),
        );
        batch.update(doc(db, "groups", GROUP_ID, "cars", CAR_ID), {
            statusStamp: { engine_oil: "overdue" },
        });

        await assertFails(batch.commit());

        // ...and the stamp did not move either.
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const snapshot = await getDoc(
                doc(
                    context.firestore(),
                    "groups",
                    GROUP_ID,
                    "cars",
                    CAR_ID,
                ),
            );
            expect(snapshot.data()?.statusStamp).toEqual({});
        });
    });
});
