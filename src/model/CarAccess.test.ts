import { describe, expect, it } from "vitest";

import {
    hasCarEdit,
    hasImplicitCarEdit,
    withCarAccess,
    type Car,
} from "./Car";

const OWNER = "owner-uid";
const CREATOR = "creator-uid";
const MEMBER = "member-uid";
const OTHER = "other-uid";

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

/**
 * The access grid's model layer. [C6, C7]
 *
 * `hasCarEdit` mirrors `carEdit()` in firestore.rules and `hasImplicitCarEdit`
 * decides which cells are locked — if these two disagree with the rules, the
 * UI offers controls the server refuses.
 */
describe("hasImplicitCarEdit [C6]", () => {
    it("is true for the group's owner", () => {
        expect(hasImplicitCarEdit(car(), OWNER, OWNER)).toBe(true);
    });

    it("is true for the car's creator", () => {
        expect(hasImplicitCarEdit(car(), CREATOR, OWNER)).toBe(true);
    });

    // The distinction the grid needs: an elevated member HAS edit, but not
    // implicitly — their cell is a real toggle, not a locked badge.
    it("is false for a member the owner elevated", () => {
        expect(
            hasImplicitCarEdit(car({ access: { [MEMBER]: "edit" } }), MEMBER, OWNER),
        ).toBe(false);
    });

    it("is false for a plain member", () => {
        expect(hasImplicitCarEdit(car(), MEMBER, OWNER)).toBe(false);
    });
});

describe("withCarAccess [C7]", () => {
    it("grants a member edit", () => {
        expect(withCarAccess(car(), MEMBER, true, OWNER)).toEqual({
            [MEMBER]: "edit",
        });
    });

    it("revokes it again", () => {
        expect(
            withCarAccess(car({ access: { [MEMBER]: "edit" } }), MEMBER, false, OWNER),
        ).toEqual({});
    });

    it("leaves everyone else's access alone", () => {
        const before = car({ access: { [MEMBER]: "edit", [OTHER]: "edit" } });

        expect(withCarAccess(before, MEMBER, false, OWNER)).toEqual({
            [OTHER]: "edit",
        });
    });

    it("doesn't mutate the car it was given", () => {
        const before = car({ access: { [MEMBER]: "edit" } });
        withCarAccess(before, MEMBER, false, OWNER);

        expect(before.access).toEqual({ [MEMBER]: "edit" });
    });

    /**
     * Implicit holders are never written into the map — the rules refuse it,
     * and storing them would create a second source of truth for something the
     * document already knows. Asking is a no-op rather than an error, because
     * the UI locks those cells and should never ask.
     */
    it("refuses to write the owner or the creator in", () => {
        expect(withCarAccess(car(), OWNER, true, OWNER)).toEqual({});
        expect(withCarAccess(car(), CREATOR, true, OWNER)).toEqual({});
    });

    it("produces a map every value of which is 'edit'", () => {
        // The rules require it: there is no second grade.
        const result = withCarAccess(car(), MEMBER, true, OWNER);
        expect(Object.values(result)).toEqual(["edit"]);
    });
});

describe("hasCarEdit agrees with the grid's locking", () => {
    it("everyone implicit also reads as having edit", () => {
        for (const uid of [OWNER, CREATOR]) {
            expect(hasImplicitCarEdit(car(), uid, OWNER)).toBe(true);
            expect(hasCarEdit(car(), uid, OWNER)).toBe(true);
        }
    });

    // The round trip the grid performs on every toggle.
    it("a granted member reads as having edit, and loses it on revoke", () => {
        const granted = car({ access: withCarAccess(car(), MEMBER, true, OWNER) });
        expect(hasCarEdit(granted, MEMBER, OWNER)).toBe(true);

        const revoked = car({
            access: withCarAccess(granted, MEMBER, false, OWNER),
        });
        expect(hasCarEdit(revoked, MEMBER, OWNER)).toBe(false);
    });
});
