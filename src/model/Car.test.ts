import type { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import {
    carDisplayName,
    carSubtitle,
    formatOdometer,
    hasCarEdit,
    sortCars,
    toCar,
    type Car,
} from "./Car";

const OWNER = "owner-uid";
const CREATOR = "creator-uid";
const MEMBER = "member-uid";

const stamp = (millis: number) =>
    ({ toMillis: () => millis }) as unknown as Timestamp;

const car = (overrides: Partial<Car> = {}): Car => ({
    id: "car-1",
    brand: "Perodua",
    model: "Myvi",
    year: 2018,
    access: {},
    lastByType: {},
    statusStamp: {},
    totalSpend: 0,
    createdBy: CREATOR,
    createdAt: null,
    odometerCorrectedAt: null,
    ...overrides,
});

describe("toCar", () => {
    it("reads a full document", () => {
        const result = toCar("myvi", {
            brand: "Proton",
            model: "Saga",
            year: 2021,
            nickname: "Dad's Saga",
            plate: "WXY 1234",
            odometer: 40000,
            access: { [MEMBER]: "edit" },
            lastByType: {},
            statusStamp: {},
            totalSpend: 250,
            createdBy: CREATOR,
        });

        expect(result).toMatchObject({
            id: "myvi",
            brand: "Proton",
            nickname: "Dad's Saga",
            odometer: 40000,
            totalSpend: 250,
        });
    });

    // Same defensiveness as toGroup: a hand-authored console document must
    // render, not crash a list.
    it("survives a document with nothing on it", () => {
        const result = toCar("sparse", {});

        expect(result.brand).toBe("");
        expect(result.access).toEqual({});
        expect(result.totalSpend).toBe(0);
        expect(result.createdAt).toBeNull();
    });

    it("treats blank optional strings as absent", () => {
        const result = toCar("blank", { nickname: "   ", plate: "" });

        expect(result.nickname).toBeUndefined();
        expect(result.plate).toBeUndefined();
    });

    // A pending serverTimestamp() reads back as null before the write settles;
    // everything downstream expects a Timestamp or nothing.
    it("drops a createdAt that isn't a real Timestamp", () => {
        expect(toCar("x", { createdAt: undefined }).createdAt).toBeNull();
        expect(toCar("x", { createdAt: stamp(5) }).createdAt).not.toBeNull();
    });
});

describe("naming [C3]", () => {
    it("prefers the nickname — it's what the family actually says", () => {
        expect(carDisplayName(car({ nickname: "Mum's Myvi" }))).toBe("Mum's Myvi");
    });

    it("falls back to make and model", () => {
        expect(carDisplayName(car())).toBe("Perodua Myvi");
    });

    it("never renders an empty headline", () => {
        expect(carDisplayName(car({ brand: "", model: "" }))).toBe("Untitled car");
    });

    it("moves make and model into the subtitle once a nickname exists", () => {
        expect(carSubtitle(car({ nickname: "Mum's Myvi" }))).toBe(
            "Perodua Myvi · 2018",
        );
        // Without a nickname the headline already says the make, so the
        // subtitle would only repeat it.
        expect(carSubtitle(car())).toBe("2018");
    });
});

describe("hasCarEdit [C6]", () => {
    it("grants the group owner edit over everything in their group", () => {
        expect(hasCarEdit(car(), OWNER, OWNER)).toBe(true);
    });

    it("grants the creator edit over what they added", () => {
        expect(hasCarEdit(car(), CREATOR, OWNER)).toBe(true);
    });

    it("grants a member the owner has elevated", () => {
        expect(hasCarEdit(car({ access: { [MEMBER]: "edit" } }), MEMBER, OWNER)).toBe(
            true,
        );
    });

    // The view floor: being in the group lets you SEE the car, nothing more.
    it("refuses a plain member", () => {
        expect(hasCarEdit(car(), MEMBER, OWNER)).toBe(false);
    });

    it("refuses a signed-out caller", () => {
        expect(hasCarEdit(car(), undefined, OWNER)).toBe(false);
    });
});

describe("sortCars", () => {
    it("puts the newest first", () => {
        const older = car({ id: "a", createdAt: stamp(1000) });
        const newer = car({ id: "b", createdAt: stamp(2000) });

        expect(sortCars([older, newer]).map((entry) => entry.id)).toEqual([
            "b",
            "a",
        ]);
    });

    // A car whose write hasn't settled has no timestamp yet; the name tiebreak
    // is what stops the list flickering as it lands.
    it("falls back to name when timestamps tie", () => {
        const zeta = car({ id: "z", nickname: "Zeta" });
        const alpha = car({ id: "a", nickname: "Alpha" });

        expect(sortCars([zeta, alpha]).map((entry) => entry.id)).toEqual([
            "a",
            "z",
        ]);
    });

    it("doesn't mutate its input", () => {
        const cars = [car({ id: "a" }), car({ id: "b" })];
        sortCars(cars);
        expect(cars.map((entry) => entry.id)).toEqual(["a", "b"]);
    });
});

describe("formatOdometer", () => {
    it("groups thousands and names the unit", () => {
        expect(formatOdometer(128400)).toBe("128,400 km");
    });

    it("renders nothing when there's no reading", () => {
        expect(formatOdometer(undefined)).toBe("");
    });
});
