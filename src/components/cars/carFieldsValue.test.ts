import { describe, expect, it } from "vitest";

import {
    EMPTY_CAR_FIELDS,
    carToFields,
    resolvedBrand,
    resolvedModel,
} from "./carFieldsValue";
import type { Car } from "../../model/Car";

const car = (overrides: Partial<Car> = {}): Car => ({
    id: "car-1",
    brand: "Perodua",
    model: "Myvi",
    year: 2018,
    access: {},
    lastByType: {},
    statusStamp: {},
    totalSpend: 0,
    createdBy: "someone",
    createdAt: null,
    odometerCorrectedAt: null,
    ...overrides,
});

describe("carToFields [C8]", () => {
    it("seeds the pickers for a car the catalogue knows", () => {
        expect(carToFields(car())).toMatchObject({
            brand: "Perodua",
            brandOther: "",
            model: "Myvi",
            modelOther: "",
            year: "2018",
        });
    });

    /**
     * The round trip that matters. A car added through the "Other" escape has
     * a make the pickers can't represent — if the form dropped it, opening the
     * edit screen to change a plate would blank the make on save.
     */
    it("brings an Other-brand car back as free text", () => {
        // Bufori: a real marque, assembled in Malaysia, and deliberately not in
        // the curated list. This case needs a brand the catalogue does NOT
        // know, so it has to be one nobody is likely to add — the test used
        // "Volkswagen" until the list grew from 9 brands to 39 and quietly
        // started asserting the opposite of what it means.
        const fields = carToFields(car({ brand: "Bufori", model: "Geneva" }));

        expect(fields.brand).toBe("Other");
        expect(fields.brandOther).toBe("Bufori");
        expect(fields.modelOther).toBe("Geneva");
        expect(resolvedBrand(fields)).toBe("Bufori");
        expect(resolvedModel(fields)).toBe("Geneva");
    });

    // A model retired from the bundled list since the car was added.
    it("falls back to free text for a known brand with an unknown model", () => {
        const fields = carToFields(car({ brand: "Perodua", model: "Rusa" }));

        expect(fields.brand).toBe("Other");
        expect(resolvedBrand(fields)).toBe("Perodua");
        expect(resolvedModel(fields)).toBe("Rusa");
    });

    it("carries the optional fields through, and leaves absent ones empty", () => {
        expect(
            carToFields(car({ nickname: "Mum's Myvi", plate: "WXY 1234" })),
        ).toMatchObject({ nickname: "Mum's Myvi", plate: "WXY 1234" });

        expect(carToFields(car())).toMatchObject({
            nickname: "",
            plate: "",
            odometer: "",
        });
    });

    it("stringifies the odometer for the form", () => {
        expect(carToFields(car({ odometer: 128400 })).odometer).toBe("128400");
    });
});

describe("resolved values", () => {
    it("reads the pickers when a brand was chosen from the list", () => {
        const fields = { ...EMPTY_CAR_FIELDS, brand: "Toyota", model: "Vios" };

        expect(resolvedBrand(fields)).toBe("Toyota");
        expect(resolvedModel(fields)).toBe("Vios");
    });

    // Whichever pair is live, the other must not leak into what gets written.
    it("ignores stale free text once a real brand is chosen", () => {
        const fields = {
            ...EMPTY_CAR_FIELDS,
            brand: "Toyota",
            model: "Vios",
            brandOther: "Volkswagen",
            modelOther: "Golf",
        };

        expect(resolvedBrand(fields)).toBe("Toyota");
        expect(resolvedModel(fields)).toBe("Vios");
    });

    it("ignores stale picker values once Other is chosen", () => {
        const fields = {
            ...EMPTY_CAR_FIELDS,
            brand: "Other",
            model: "Vios",
            brandOther: "Volkswagen",
            modelOther: "Golf",
        };

        expect(resolvedBrand(fields)).toBe("Volkswagen");
        expect(resolvedModel(fields)).toBe("Golf");
    });
});
