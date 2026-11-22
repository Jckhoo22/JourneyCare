import { describe, expect, it } from "vitest";

import {
    OTHER_BRAND,
    brandNames,
    findModel,
    findPreset,
    isOtherBrand,
    maintenancePresets,
    modelsForBrand,
    openYearRange,
    presetsByGroup,
    yearsForModel,
} from "./CarCatalogue";

/** A fixed "today" so the year maths doesn't drift with the calendar. */
const TODAY = new Date("2026-07-27T00:00:00Z");

describe("brands [C2]", () => {
    it("offers the Malaysia-focused set", () => {
        const names = brandNames();

        expect(names).toContain("Perodua");
        expect(names).toContain("Proton");
        expect(names).toContain("Toyota");
    });

    // The escape hatch has to be findable, and last — a curated list is only
    // acceptable if there's an obvious way past it.
    it("pins Other to the end of the list", () => {
        const names = brandNames();

        expect(names[names.length - 1]).toBe(OTHER_BRAND);
        expect(isOtherBrand(OTHER_BRAND)).toBe(true);
        expect(isOtherBrand("Perodua")).toBe(false);
    });

    it("has no duplicate brand names", () => {
        const names = brandNames();
        expect(new Set(names).size).toBe(names.length);
    });

    /**
     * The list shipped with 9 brands, which was read as the picker being
     * broken rather than as the catalogue being short — "creating a car
     * doesn't show all brands". It wasn't a UI limit; there was nothing to
     * show. This pins the marques a Malaysian driver is most likely to be
     * holding the keys to.
     */
    it("covers the marques actually on Malaysian roads", () => {
        const names = brandNames();

        for (const brand of [
            "Perodua",
            "Proton",
            "Toyota",
            "Honda",
            "Nissan",
            "Mazda",
            "Mitsubishi",
            "Hyundai",
            "Kia",
            "Volkswagen",
            "Ford",
            "Isuzu",
            "Subaru",
            "Suzuki",
            "BMW",
            "Mercedes-Benz",
            "Audi",
            "Volvo",
            "Lexus",
            "BYD",
            "Chery",
        ]) {
            expect(names, `${brand} missing from the brand list`).toContain(brand);
        }
    });

    it("sorts everything after the two national marques alphabetically", () => {
        // Perodua and Proton lead because they are most of the cars here; the
        // rest is alphabetical because that is how you find one in a list of
        // this length.
        const names = brandNames();

        expect(names[0]).toBe("Perodua");
        expect(names[1]).toBe("Proton");

        const middle = names.slice(2, -1); // everything but the leaders and Other
        const sorted = [...middle].sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase()),
        );
        expect(middle).toEqual(sorted);
    });

    it("gives every brand at least one model to pick", () => {
        const empty = brandNames()
            .filter((name) => !isOtherBrand(name))
            .filter((name) => modelsForBrand(name).length === 0);

        expect(empty).toEqual([]);
    });

    it("keeps every model's year range coherent", () => {
        const broken: string[] = [];

        for (const brand of brandNames().filter((name) => !isOtherBrand(name))) {
            for (const model of modelsForBrand(brand)) {
                // `to` is absent for anything still sold; when present it can
                // never predate the first year on sale, or the year picker
                // renders an empty list and the form dead-ends.
                if (model.to !== undefined && model.to < model.from) {
                    broken.push(`${brand} ${model.name}`);
                }
                if (yearsForModel(model, TODAY).length === 0) {
                    broken.push(`${brand} ${model.name} (no selectable years)`);
                }
            }
        }

        expect(broken).toEqual([]);
    });
});

describe("models [C2]", () => {
    it("lists a brand's models", () => {
        const models = modelsForBrand("Perodua").map((entry) => entry.name);

        expect(models).toContain("Myvi");
        expect(models).toContain("Axia");
    });

    it("returns nothing for Other, and for anything unrecognised", () => {
        expect(modelsForBrand(OTHER_BRAND)).toEqual([]);
        expect(modelsForBrand("Lamborghini")).toEqual([]);
    });

    it("finds a model within its brand only", () => {
        expect(findModel("Perodua", "Myvi")?.from).toBe(2005);
        // A Myvi is not a Toyota, however the pickers were left.
        expect(findModel("Toyota", "Myvi")).toBeUndefined();
    });

    it("gives every model a plausible from-year", () => {
        for (const brand of brandNames().filter((name) => !isOtherBrand(name))) {
            for (const model of modelsForBrand(brand)) {
                expect(model.from).toBeGreaterThanOrEqual(1950);
                expect(model.from).toBeLessThanOrEqual(2026);
                if (model.to) expect(model.to).toBeGreaterThanOrEqual(model.from);
            }
        }
    });
});

describe("years [C2]", () => {
    it("runs from next year back to the model's first, newest first", () => {
        const years = yearsForModel(findModel("Perodua", "Axia"), TODAY);

        // Next year, not this one: dealerships sell the coming model year
        // before it arrives, and a picker that can't say so is wrong every
        // December.
        expect(years[0]).toBe(2027);
        expect(years[years.length - 1]).toBe(2014);
        expect(years).toEqual([...years].sort((a, b) => b - a));
    });

    it("stops at the last year a discontinued model was sold", () => {
        const years = yearsForModel(findModel("Perodua", "Kancil"), TODAY);

        expect(years[0]).toBe(2009);
        expect(years).not.toContain(2026);
    });

    it("offers an open range when no model is known — the Other path", () => {
        const years = openYearRange(TODAY);

        expect(years[0]).toBe(2027);
        expect(years[years.length - 1]).toBe(1980);
    });
});

describe("maintenance presets [L3]", () => {
    it("ships every type the spec lists", () => {
        const ids = maintenancePresets().map((preset) => preset.id);

        expect(ids).toContain("engine_oil");
        expect(ids).toContain("road_tax_insurance");
        expect(ids).toContain("custom");
    });

    it("carries the default intervals T12 and T13 will read", () => {
        expect(findPreset("engine_oil")).toMatchObject({ km: 10000, months: 6 });
        expect(findPreset("battery")).toMatchObject({ months: 24 });
        expect(findPreset("brake_pads")).toMatchObject({ km: 40000 });
    });

    // "Whichever comes first" only means something if a type can carry one
    // interval, both, or neither — Custom is the neither.
    it("gives Custom no interval at all", () => {
        const custom = findPreset("custom");

        expect(custom?.km).toBeUndefined();
        expect(custom?.months).toBeUndefined();
    });

    it("has no duplicate ids", () => {
        const ids = maintenancePresets().map((preset) => preset.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    /**
     * The list was service-centric: it could record an oil change but had no
     * entry for the parts a car actually gets through. Every one of these has
     * to exist by id, because a stored log and a car's `lastByType` key both
     * reference the id and an id is therefore permanent.
     */
    it("covers the parts a car gets replaced", () => {
        const ids = maintenancePresets().map((preset) => preset.id);

        for (const id of [
            "brake_pads",
            "brake_discs",
            "battery",
            "tires",
            "absorbers",
            "wipers",
            "air_filter",
            "cabin_filter",
            "spark_plugs",
            "timing_belt",
            "bulbs",
            "coolant",
            "transmission_fluid",
        ]) {
            expect(ids, `${id} missing from the presets`).toContain(id);
        }
    });

    it("gives the new parts intervals a Malaysian owner would recognise", () => {
        expect(findPreset("timing_belt")).toMatchObject({ km: 100000, months: 60 });
        expect(findPreset("spark_plugs")).toMatchObject({ km: 40000 });
        expect(findPreset("brake_discs")).toMatchObject({ km: 80000 });
        expect(findPreset("cabin_filter")).toMatchObject({ km: 20000, months: 12 });
        expect(findPreset("absorbers")).toMatchObject({ km: 80000 });
    });

    /**
     * A bulb is replaced when it blows, not on a schedule. Giving it an
     * interval would manufacture a reminder nobody asked for; `nextDueForType`
     * returns null for a type with neither, so no interval means no reminder
     * rather than a broken one.
     */
    it("gives bulbs no interval, deliberately", () => {
        const bulbs = findPreset("bulbs");

        expect(bulbs).toBeDefined();
        expect(bulbs?.km).toBeUndefined();
        expect(bulbs?.months).toBeUndefined();
    });

    it("puts every type in a group that exists", () => {
        const groupIds = new Set(presetsByGroup().map((entry) => entry.group.id));
        const orphans = maintenancePresets()
            .filter((preset) => !groupIds.has(preset.group))
            .map((preset) => preset.id);

        // An orphan wouldn't throw — presetsByGroup just wouldn't render it,
        // so the type would silently vanish from the picker.
        expect(orphans).toEqual([]);
    });

    it("keeps every interval a positive whole number", () => {
        const broken = maintenancePresets()
            .filter(
                (preset) =>
                    (preset.km !== undefined &&
                        (!Number.isInteger(preset.km) || preset.km <= 0)) ||
                    (preset.months !== undefined &&
                        (!Number.isInteger(preset.months) || preset.months <= 0)),
            )
            .map((preset) => preset.id);

        expect(broken).toEqual([]);
    });
});
