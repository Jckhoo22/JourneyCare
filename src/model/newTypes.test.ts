import { describe, expect, it } from "vitest";
import type { Timestamp } from "firebase/firestore";

import { findPreset, maintenancePresets } from "./CarCatalogue";
import { dueForCar, dueTypeLabel } from "./Due";
import { toLastService } from "./Log";
import type { Car } from "./Car";
import type { Log } from "./Log";

/**
 * Do the new parts presets work without a code change? [L3, R1]
 *
 * The question is worth a file of its own because the answer is a property of
 * the DESIGN, not of the data: nothing between a preset and a reminder ever
 * names a type.
 *
 *   - `car.lastByType` is a map keyed by whatever string the log carried;
 *   - `nextDueForCar` iterates that map's entries;
 *   - the intervals come off the LOG, copied there at write time, not looked
 *     up from the preset at display time;
 *   - the rules validate `type` as a bounded string, with no allowlist;
 *   - `dueTypeLabel` falls back to the raw id when no preset matches.
 *
 * So a new preset is data, and these tests are what would fail if someone ever
 * introduced a hardcoded list of types in the middle of that chain.
 */

const stamp = (iso: string): Timestamp =>
    ({
        toDate: () => new Date(iso),
        toMillis: () => Date.parse(iso),
    }) as unknown as Timestamp;

const NOW = new Date("2026-07-27T00:00:00Z");

const carWith = (lastByType: Car["lastByType"], odometer?: number): Car =>
    ({
        id: "myvi",
        brand: "Perodua",
        model: "Myvi",
        access: {},
        lastByType,
        statusStamp: {},
        totalSpend: 0,
        createdBy: "u1",
        odometer,
    }) as Car;

const logOf = (type: string, over: Partial<Log> = {}): Log => {
    const preset = findPreset(type);
    return {
        id: `log-${type}`,
        type,
        cost: 300,
        date: stamp("2026-01-01T00:00:00Z"),
        odometer: 100000,
        intervalKm: preset?.km,
        intervalMonths: preset?.months,
        createdBy: { uid: "u1", username: "Jie" },
        createdAt: stamp("2026-01-01T00:00:00Z"),
        ...over,
    } as Log;
};

describe("the new parts types need no code change [L3, R1]", () => {
    it("seeds lastByType straight from a log of a brand-new type", () => {
        const log = logOf("timing_belt");
        const entry = toLastService(stamp("2026-01-01T00:00:00Z"), log);

        // The intervals rode across from the preset via the log, untouched.
        expect(entry).toMatchObject({
            odometer: 100000,
            intervalKm: 100000,
            intervalMonths: 60,
        });
    });

    it("computes a next-due for a type that did not exist last release", () => {
        const car = carWith({
            timing_belt: {
                date: stamp("2026-01-01T00:00:00Z"),
                odometer: 100000,
                intervalKm: 100000,
                intervalMonths: 60,
            },
        });

        const [item] = dueForCar(car, NOW);

        expect(item.type).toBe("timing_belt");
        expect(item.dueKm).toBe(200000);
        expect(item.dueDate?.getFullYear()).toBe(2031);
        expect(item.basis).toBe("both");
    });

    it("marks a km-only part overdue once the reading passes it", () => {
        // Spark plugs carry km and no months — the 'km' basis, which is the
        // one a service-centric catalogue had few examples of.
        const car = carWith(
            {
                spark_plugs: {
                    date: stamp("2025-01-01T00:00:00Z"),
                    odometer: 100000,
                    intervalKm: 40000,
                },
            },
            145000,
        );

        const [item] = dueForCar(car, NOW);

        expect(item.type).toBe("spark_plugs");
        expect(item.basis).toBe("km");
        expect(item.status).toBe("OVERDUE");
    });

    it("raises no reminder for a part with no interval", () => {
        // Bulbs. A type with neither interval yields nothing rather than an
        // item with nothing to say.
        const car = carWith({
            bulbs: { date: stamp("2026-01-01T00:00:00Z"), odometer: 100000 },
        });

        expect(dueForCar(car, NOW)).toEqual([]);
    });

    it("labels every new type from the catalogue, not the raw id", () => {
        for (const id of [
            "brake_discs",
            "cabin_filter",
            "spark_plugs",
            "timing_belt",
            "absorbers",
            "bulbs",
        ]) {
            expect(dueTypeLabel(id)).not.toBe(id);
            expect(dueTypeLabel(id).length).toBeGreaterThan(0);
        }
    });

    it("still falls back to the id for a type the catalogue lost", () => {
        // A preset retired in a later release must not blank the history of
        // anyone who logged against it.
        expect(dueTypeLabel("carburettor_rebuild")).toBe("carburettor_rebuild");
    });

    /**
     * `statusStamp` is capped at 50 keys by the rules, one per type that has
     * ever crossed into due-soon or overdue. The catalogue has to stay well
     * under that or a car could become unstampable.
     */
    it("leaves plenty of room under the statusStamp cap", () => {
        expect(maintenancePresets().length).toBeLessThan(50);
    });
});
