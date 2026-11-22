import { describe, expect, it } from "vitest";

import {
    DUE_SOON_DAYS,
    DUE_SOON_KM,
    addMonths,
    addTallies,
    detectChanges,
    hasNoChanges,
    nextStamp,
    nextDueForCar,
    nextDueForType,
    needsAttention,
    tally,
    worseStatus,
    worstStatus,
    type LastService,
} from "./nextDue";

/**
 * The whole point of this lib being pure: `now` is an argument, so every
 * boundary below is exact rather than "roughly a month".
 */
const NOW = new Date(2026, 6, 27); // 27 July 2026, local

/** A service done `daysAgo`, optionally at a reading. */
const done = (daysAgo: number, extra: Partial<LastService> = {}): LastService => {
    const date = new Date(NOW.getTime());
    date.setDate(date.getDate() - daysAgo);
    return { date, ...extra };
};

describe("addMonths", () => {
    it("adds whole months", () => {
        expect(addMonths(new Date(2026, 0, 15), 6)).toEqual(new Date(2026, 6, 15));
    });

    /**
     * The bug this exists to avoid: `setMonth` rolls 31 January + 1 month over
     * into 3 March, which would report a service due days later than it is —
     * wrong in a way nobody notices and everybody trusts.
     */
    it("clamps to the end of a shorter month instead of rolling over", () => {
        expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
        expect(addMonths(new Date(2026, 0, 31), 3)).toEqual(new Date(2026, 3, 30));
    });

    it("handles a leap February", () => {
        expect(addMonths(new Date(2028, 0, 31), 1)).toEqual(new Date(2028, 1, 29));
    });

    it("crosses a year boundary", () => {
        expect(addMonths(new Date(2026, 10, 15), 4)).toEqual(new Date(2027, 2, 15));
    });
});

describe("worseStatus", () => {
    it("ranks OVERDUE above DUE_SOON above OK", () => {
        expect(worseStatus("OK", "DUE_SOON")).toBe("DUE_SOON");
        expect(worseStatus("DUE_SOON", "OVERDUE")).toBe("OVERDUE");
        expect(worseStatus("OVERDUE", "OK")).toBe("OVERDUE");
        expect(worseStatus("OK", "OK")).toBe("OK");
    });
});

// ──────────────────────────────────────────────────────── NO INTERVAL [R1]

describe("a type with no interval", () => {
    /**
     * R1 covers types "carrying an interval". A service with neither is a
     * record of something that happened, not a promise about something that
     * will — so it's excluded from the due list entirely.
     */
    it("is excluded", () => {
        expect(nextDueForType("wipers", done(10), 100000, NOW)).toBeNull();
    });

    it("is excluded from a car's list too", () => {
        const items = nextDueForCar(
            {
                wipers: done(10),
                engine_oil: done(10, { intervalMonths: 6 }),
            },
            100000,
            NOW,
        );

        expect(items.map((item) => item.type)).toEqual(["engine_oil"]);
    });

    // A km interval with no reading to count from is equally unusable.
    it("is excluded when a km interval has no service odometer", () => {
        expect(
            nextDueForType("tires", done(10, { intervalKm: 50000 }), 100000, NOW),
        ).toBeNull();
    });
});

// ───────────────────────────────────────────────────────── MONTHS ONLY [R2]

describe("months only", () => {
    it("is OK well before the date", () => {
        const item = nextDueForType(
            "battery",
            done(30, { intervalMonths: 24 }),
            undefined,
            NOW,
        )!;

        expect(item.status).toBe("OK");
        expect(item.basis).toBe("date");
        expect(item.dueKm).toBeUndefined();
    });

    it("is DUE_SOON inside the 30-day window", () => {
        // Done 6 months ago less a fortnight, on a 6-month interval.
        const item = nextDueForType(
            "engine_oil",
            { date: new Date(2026, 1, 10), intervalMonths: 6 },
            undefined,
            NOW,
        )!;

        expect(item.dueDate).toEqual(new Date(2026, 7, 10));
        expect(item.status).toBe("DUE_SOON");
    });

    it("is OVERDUE past the date", () => {
        // The manual test's case: 7 months ago on a 6-month interval.
        const item = nextDueForType(
            "engine_oil",
            { date: new Date(2025, 11, 27), intervalMonths: 6 },
            undefined,
            NOW,
        )!;

        expect(item.status).toBe("OVERDUE");
    });

    it("treats the exact threshold as DUE_SOON, and one day more as OK", () => {
        const atThreshold = new Date(NOW.getTime());
        atThreshold.setDate(atThreshold.getDate() + DUE_SOON_DAYS);

        const justOutside = new Date(NOW.getTime());
        justOutside.setDate(justOutside.getDate() + DUE_SOON_DAYS + 1);

        expect(
            nextDueForType("x", { date: atThreshold, intervalMonths: 0 }, undefined, NOW)!
                .status,
        ).toBe("DUE_SOON");
        expect(
            nextDueForType("x", { date: justOutside, intervalMonths: 0 }, undefined, NOW)!
                .status,
        ).toBe("OK");
    });
});

// ───────────────────────────────────────────────────────────── KM ONLY [R2]

describe("km only", () => {
    const lastService = { date: new Date(2026, 0, 1), odometer: 100000, intervalKm: 10000 };

    it("is OK with plenty of kilometres left", () => {
        const item = nextDueForType("engine_oil", lastService, 104000, NOW)!;

        expect(item.dueKm).toBe(110000);
        expect(item.basis).toBe("km");
        expect(item.status).toBe("OK");
        expect(item.dueDate).toBeUndefined();
    });

    it("is DUE_SOON within the last thousand", () => {
        expect(
            nextDueForType("engine_oil", lastService, 109500, NOW)!.status,
        ).toBe("DUE_SOON");
    });

    it("is OVERDUE past the target", () => {
        expect(
            nextDueForType("engine_oil", lastService, 111000, NOW)!.status,
        ).toBe("OVERDUE");
    });

    it("treats the exact threshold as DUE_SOON", () => {
        expect(
            nextDueForType(
                "engine_oil",
                lastService,
                110000 - DUE_SOON_KM,
                NOW,
            )!.status,
        ).toBe("DUE_SOON");
    });
});

// ───────────────────────────────────── NO CURRENT ODOMETER — the awkward one

/**
 * A car whose current reading was never filled in. The km target is still
 * worth showing — "at 110,000 km" is useful — but nothing can say whether it
 * has been passed, so it must not contribute a status. [R2]
 */
describe("a car with no current odometer", () => {
    const lastService = {
        date: new Date(2026, 0, 1),
        odometer: 100000,
        intervalKm: 10000,
    };

    it("still reports the km target, with the status flagged unknown", () => {
        const item = nextDueForType("engine_oil", lastService, undefined, NOW)!;

        expect(item.dueKm).toBe(110000);
        expect(item.kmStatusUnknown).toBe(true);
    });

    it("claims no urgency it cannot justify", () => {
        // km-only and unknowable: OK, not a guessed OVERDUE.
        expect(
            nextDueForType("engine_oil", lastService, undefined, NOW)!.status,
        ).toBe("OK");
    });

    it("falls back to the date side when both intervals exist", () => {
        const item = nextDueForType(
            "engine_oil",
            { ...lastService, date: new Date(2025, 11, 27), intervalMonths: 6 },
            undefined,
            NOW,
        )!;

        // The date has passed; the km side abstains rather than voting OK.
        expect(item.status).toBe("OVERDUE");
        expect(item.basis).toBe("both");
        expect(item.kmStatusUnknown).toBe(true);
    });

    it("flags nothing unknown when there is no km target at all", () => {
        expect(
            nextDueForType("battery", done(10, { intervalMonths: 24 }), undefined, NOW)!
                .kmStatusUnknown,
        ).toBe(false);
    });
});

// ─────────────────────────────────────────────── WHICHEVER COMES FIRST [R1]

describe("both intervals — whichever comes first", () => {
    it("is OVERDUE on kilometres even when the date is far off", () => {
        const item = nextDueForType(
            "engine_oil",
            {
                date: new Date(2026, 6, 1), // three weeks ago
                odometer: 100000,
                intervalKm: 10000,
                intervalMonths: 6,
            },
            115000, // 5,000 km past
            NOW,
        )!;

        expect(item.basis).toBe("both");
        expect(item.status).toBe("OVERDUE");
    });

    it("is OVERDUE on the date even with kilometres to spare", () => {
        const item = nextDueForType(
            "engine_oil",
            {
                date: new Date(2025, 11, 1),
                odometer: 100000,
                intervalKm: 10000,
                intervalMonths: 6,
            },
            101000,
            NOW,
        )!;

        expect(item.status).toBe("OVERDUE");
    });

    it("is OK only when BOTH sides are comfortable", () => {
        const item = nextDueForType(
            "engine_oil",
            {
                date: new Date(2026, 6, 1),
                odometer: 100000,
                intervalKm: 10000,
                intervalMonths: 6,
            },
            101000,
            NOW,
        )!;

        expect(item.status).toBe("OK");
        expect(item.dueDate).toEqual(new Date(2027, 0, 1));
        expect(item.dueKm).toBe(110000);
    });

    it("takes the worse side when they disagree", () => {
        const item = nextDueForType(
            "engine_oil",
            {
                date: new Date(2026, 6, 1),
                odometer: 100000,
                intervalKm: 10000,
                intervalMonths: 6,
            },
            109500, // DUE_SOON on km, OK on date
            NOW,
        )!;

        expect(item.status).toBe("DUE_SOON");
    });
});

// ─────────────────────────────────────────────────────────── OTHER EDGES

describe("edge cases", () => {
    it("a service logged today is as far from due as it gets", () => {
        const item = nextDueForType(
            "engine_oil",
            { date: NOW, odometer: 128400, intervalKm: 10000, intervalMonths: 6 },
            128400,
            NOW,
        )!;

        expect(item.status).toBe("OK");
        expect(item.dueDate).toEqual(new Date(2027, 0, 27));
        expect(item.dueKm).toBe(138400);
    });

    /**
     * L4 lets the interval be overridden per entry, so the lib must read the
     * stored numbers and never the preset's defaults.
     */
    it("uses the entry's overridden interval, not any default", () => {
        const item = nextDueForType(
            "engine_oil",
            { date: new Date(2026, 6, 1), intervalMonths: 3 },
            undefined,
            NOW,
        )!;

        // 3 months from 1 July, not the preset's 6.
        expect(item.dueDate).toEqual(new Date(2026, 9, 1));
    });

    it("handles an interval of zero months as due immediately", () => {
        const item = nextDueForType(
            "x",
            { date: new Date(2026, 6, 1), intervalMonths: 0 },
            undefined,
            NOW,
        )!;

        expect(item.status).toBe("OVERDUE");
    });

    it("returns an empty list for a car with no history at all", () => {
        expect(nextDueForCar({}, 100000, NOW)).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────── AGGREGATION [R3]

describe("aggregation", () => {
    const lastByType: Record<string, LastService> = {
        // Overdue on date.
        engine_oil: { date: new Date(2025, 11, 27), intervalMonths: 6 },
        // Due soon on date.
        aircond: { date: new Date(2025, 7, 10), intervalMonths: 12 },
        // Comfortably fine.
        battery: { date: new Date(2026, 0, 1), intervalMonths: 24 },
        // No interval — never appears.
        wipers: { date: new Date(2026, 0, 1) },
    };

    it("sorts most urgent first", () => {
        const items = nextDueForCar(lastByType, undefined, NOW);

        expect(items.map((item) => item.status)).toEqual([
            "OVERDUE",
            "DUE_SOON",
            "OK",
        ]);
    });

    it("reports the worst status for a card's badge [C10]", () => {
        expect(worstStatus(nextDueForCar(lastByType, undefined, NOW))).toBe(
            "OVERDUE",
        );
        expect(worstStatus([])).toBe("OK");
    });

    it("filters to only what needs acting on [R3]", () => {
        const attention = needsAttention(nextDueForCar(lastByType, undefined, NOW));

        expect(attention).toHaveLength(2);
        expect(attention.every((item) => item.status !== "OK")).toBe(true);
    });

    it("tallies for the home strip [R3]", () => {
        expect(tally(nextDueForCar(lastByType, undefined, NOW))).toEqual({
            dueSoon: 1,
            overdue: 1,
        });
    });

    it("adds tallies across cars and groups", () => {
        expect(
            addTallies({ dueSoon: 1, overdue: 2 }, { dueSoon: 3, overdue: 0 }),
        ).toEqual({ dueSoon: 4, overdue: 2 });
    });

    // A total order, so the list never reshuffles between two renders of the
    // same data.
    it("orders deterministically when status and date tie", () => {
        const sameDay = { date: new Date(2026, 6, 1), intervalMonths: 1 };
        const items = nextDueForCar(
            { zebra: sameDay, alpha: sameDay },
            undefined,
            NOW,
        );

        expect(items.map((item) => item.type)).toEqual(["alpha", "zebra"]);
    });
});

/**
 * ─── The dedupe [R4] ────────────────────────────────────────────────────────
 *
 * THE test of the task: opening the app twice must notify once. Everything
 * here runs against `detectChanges`, which is what the controller actually
 * calls — so a regression in the real path fails here, not only in a mock.
 */
describe("detectChanges — the R4 dedupe", () => {
    /** Overdue: due 8 months ago on a 6-month interval. */
    const overdueOil = { engine_oil: done(240, { intervalMonths: 6 }) };
    /** Due soon: 6-month interval, serviced 5 months and 20 days ago. */
    const soonOil = { engine_oil: done(172, { intervalMonths: 6 }) };
    /** Fine: serviced last week on a 6-month interval. */
    const freshOil = { engine_oil: done(7, { intervalMonths: 6 }) };

    const changesFor = (
        lastByType: Record<string, LastService>,
        stamp: Record<string, string>,
    ) => detectChanges(nextDueForCar(lastByType, undefined, NOW), stamp);

    it("reports the first crossing into overdue", () => {
        const changes = changesFor(overdueOil, {});

        expect(changes.transitions).toHaveLength(1);
        expect(changes.transitions[0].type).toBe("engine_oil");
        expect(changes.transitions[0].status).toBe("OVERDUE");
        expect(hasNoChanges(changes)).toBe(false);
    });

    /**
     * The one that matters. Same data, same status, stamp already set — the
     * second render must produce nothing at all, or every app open sends a
     * fresh reminder about the same overdue oil change.
     */
    it("reports NOTHING when the status is already stamped", () => {
        const changes = changesFor(overdueOil, { engine_oil: "overdue" });

        expect(changes.transitions).toEqual([]);
        expect(changes.cleared).toEqual([]);
        expect(hasNoChanges(changes)).toBe(true);
    });

    it("reports nothing on a re-render of a stamped due-soon either", () => {
        const changes = changesFor(soonOil, { engine_oil: "due_soon" });

        expect(hasNoChanges(changes)).toBe(true);
    });

    /** Getting worse is news, even though something was already stamped. */
    it("reports the escalation from due-soon to overdue", () => {
        const changes = changesFor(overdueOil, { engine_oil: "due_soon" });

        expect(changes.transitions).toHaveLength(1);
        expect(changes.transitions[0].status).toBe("OVERDUE");
    });

    /** Improving is not. It only drops the stamp, so the NEXT crossing lands. */
    it("clears silently when a service is done", () => {
        const changes = changesFor(freshOil, { engine_oil: "overdue" });

        expect(changes.transitions).toEqual([]);
        expect(changes.cleared).toEqual(["engine_oil"]);
    });

    it("clears a stamp for a type that no longer exists at all", () => {
        const changes = changesFor({}, { engine_oil: "overdue" });

        expect(changes.cleared).toEqual(["engine_oil"]);
    });

    it("does not stamp a type with no interval, so it never notifies", () => {
        const changes = changesFor({ tyres: done(900) }, {});

        expect(hasNoChanges(changes)).toBe(true);
    });

    it("handles several types at once, each on its own footing", () => {
        const changes = changesFor(
            {
                engine_oil: done(240, { intervalMonths: 6 }),
                air_filter: done(172, { intervalMonths: 6 }),
                brake_fluid: done(7, { intervalMonths: 6 }),
            },
            { engine_oil: "overdue", brake_fluid: "due_soon" },
        );

        // engine_oil is already stamped, brake_fluid has recovered, and only
        // air_filter has actually moved.
        expect(changes.transitions.map((entry) => entry.type)).toEqual([
            "air_filter",
        ]);
        expect(changes.cleared).toEqual(["brake_fluid"]);
    });
});

describe("nextStamp — what the car is left carrying", () => {
    const NOTHING = { transitions: [], cleared: [] };

    it("keeps an untouched stamp exactly as it was", () => {
        expect(nextStamp({ engine_oil: "overdue" }, NOTHING)).toEqual({
            engine_oil: "overdue",
        });
    });

    it("records a transition and removes a cleared type in one map", () => {
        const items = nextDueForCar(
            { engine_oil: done(240, { intervalMonths: 6 }) },
            undefined,
            NOW,
        );
        const changes = detectChanges(items, { air_filter: "due_soon" });

        expect(nextStamp({ air_filter: "due_soon" }, changes)).toEqual({
            engine_oil: "overdue",
        });
    });

    /**
     * The rules only accept 'due_soon' and 'overdue' as values, so a document
     * that somehow holds something else must not have it copied forward into
     * the next write — that would make every later stamp update fail.
     */
    it("drops a value the rules would refuse", () => {
        expect(nextStamp({ engine_oil: "nonsense" }, NOTHING)).toEqual({});
    });
});
