import type { Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    compareServiceOrder,
    customReminderLabel,
    logTypeLabel,
    parseLocalDate,
    serviceReminderKey,
    toLastService,
    toLog,
    todayInputValue,
    type Log,
} from "./Log";

const stamp = (iso: string) => {
    const date = new Date(iso);
    return {
        toMillis: () => date.getTime(),
        toDate: () => date,
    } as unknown as Timestamp;
};

const log = (overrides: Partial<Log> = {}): Log => ({
    id: "log-1",
    type: "engine_oil",
    cost: 250.5,
    date: stamp("2026-07-01T00:00:00"),
    createdBy: { uid: "someone", username: "Alex" },
    createdAt: null,
    ...overrides,
});

describe("service reminders", () => {
    it("uses separate keys for custom items and tolerates casing and spacing", () => {
        const key = serviceReminderKey({ type: "custom", customLabel: "  Oil   cooler  " });
        expect(key).toBe(serviceReminderKey({ type: "custom", customLabel: "oil cooler" }));
        expect(key).not.toBe(serviceReminderKey({ type: "custom", customLabel: "Coolant hose" }));
        expect(serviceReminderKey({ type: "engine_oil" })).toBe("engine_oil");
    });

    it("encodes custom labels safely for Firestore field paths", () => {
        const key = serviceReminderKey({ type: "custom", customLabel: "Filter A.1 / [旧]*~" });
        expect(key).not.toMatch(/[.~*/[\]]/);
        expect(customReminderLabel(key)).toBe("filter a.1 / [旧]*~");
    });

    it("orders by service date, then original creation time, then log ID", () => {
        const recent = log({ id: "a", createdAt: stamp("2026-07-02T10:00:00") });
        const early = log({ id: "z", createdAt: stamp("2026-07-02T09:00:00") });
        expect(compareServiceOrder(recent, early)).toBeGreaterThan(0);
        expect(compareServiceOrder({ ...early, date: stamp("2026-07-02T00:00:00") }, recent)).toBeGreaterThan(0);
        expect(compareServiceOrder({ ...recent, id: "b" }, recent)).toBeGreaterThan(0);
    });
});

describe("toLog", () => {
    it("reads a full entry", () => {
        expect(
            toLog("l1", {
                type: "engine_oil",
                cost: 250.5,
                odometer: 128400,
                intervalKm: 10000,
                intervalMonths: 6,
                notes: "Ah Seng Auto",
                createdBy: { uid: "u1", username: "Alex" },
            }),
        ).toMatchObject({
            id: "l1",
            type: "engine_oil",
            cost: 250.5,
            odometer: 128400,
            notes: "Ah Seng Auto",
        });
    });

    // Same defensiveness as every other `to…`: a hand-authored console entry
    // must render, not crash the history.
    it("survives an entry with nothing on it", () => {
        const result = toLog("sparse", {});

        expect(result.cost).toBe(0);
        expect(result.date).toBeNull();
        expect(result.createdBy).toEqual({ uid: "", username: "" });
    });

    it("treats blank optional strings as absent", () => {
        expect(toLog("x", { notes: "   ", customLabel: "" })).toMatchObject({
            notes: undefined,
            customLabel: undefined,
        });
    });
});

describe("logTypeLabel", () => {
    it("uses the shipped label for a preset", () => {
        expect(logTypeLabel(log())).toBe("Engine oil");
    });

    it("uses the user's own words for a custom entry", () => {
        expect(
            logTypeLabel(log({ type: "custom", customLabel: "New bulb" })),
        ).toBe("New bulb");
    });

    // A preset retired since the entry was written must not render blank.
    it("falls back rather than showing nothing", () => {
        expect(logTypeLabel(log({ type: "retired_type" }))).toBe("retired_type");
    });
});

/**
 * The timezone trap. `new Date("2026-07-27")` is UTC midnight, which in UTC+8
 * is 08:00 — so someone logging at 00:30 local would send a timestamp HOURS in
 * the future and the `date <= request.time` rule would refuse it.
 */
describe("parseLocalDate [L2]", () => {
    it("parses to LOCAL midnight, not UTC", () => {
        const parsed = parseLocalDate("2026-07-27");

        expect(parsed?.getFullYear()).toBe(2026);
        expect(parsed?.getMonth()).toBe(6);
        expect(parsed?.getDate()).toBe(27);
        expect(parsed?.getHours()).toBe(0);
    });

    it("today's value is always already in the past", () => {
        const parsed = parseLocalDate(todayInputValue());
        expect(parsed!.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("rejects anything that isn't a date input's value", () => {
        expect(parseLocalDate("")).toBeNull();
        expect(parseLocalDate("27/07/2026")).toBeNull();
        expect(parseLocalDate("2026-13-45")).not.toBeNull(); // JS rolls over
    });
});

describe("todayInputValue", () => {
    afterEach(() => vi.useRealTimers());

    it("formats in the user's own timezone, zero-padded", () => {
        expect(todayInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
    });

    // Round trip: what the input shows must parse back to the same day.
    it("round-trips through parseLocalDate", () => {
        const value = todayInputValue(new Date(2026, 6, 27));
        expect(parseLocalDate(value)?.getDate()).toBe(27);
    });
});

describe("toLastService [T13]", () => {
    it("keeps only what next-due needs", () => {
        const summary = toLastService(stamp("2026-07-01T00:00:00"), {
            odometer: 128400,
            intervalKm: 10000,
            intervalMonths: 6,
        });

        expect(summary).toMatchObject({
            odometer: 128400,
            intervalKm: 10000,
            intervalMonths: 6,
        });
        // Cost and notes stay in the entry — copying them here would be a
        // second source of truth for something already stored.
        expect(summary).not.toHaveProperty("cost");
        expect(summary).not.toHaveProperty("notes");
    });

    it("omits what the entry didn't carry", () => {
        const summary = toLastService(stamp("2026-07-01T00:00:00"), {});

        expect(summary).not.toHaveProperty("odometer");
        expect(summary).not.toHaveProperty("intervalKm");
        expect(summary).not.toHaveProperty("intervalMonths");
    });
});
