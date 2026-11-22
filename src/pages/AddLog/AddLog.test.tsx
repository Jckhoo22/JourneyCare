import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    USER,
    onSnapshot,
    getDocs,
    batchSet,
    batchUpdate,
    batchCommit,
    getDoc,
    transactionGet,
} = vi.hoisted(() => ({
    USER: {
        uid: "alice-uid",
        email: "alice@example.com",
        displayName: "Alice",
        photoURL: "",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
        reload: vi.fn(() => Promise.resolve()),
    },
    onSnapshot: vi.fn(),
    getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
    batchSet: vi.fn((_ref: unknown, _data: Record<string, unknown>) => {}),
    batchUpdate: vi.fn((_ref: unknown, _data: Record<string, unknown>) => {}),
    batchCommit: vi.fn(() => Promise.resolve()),
    transactionGet: vi.fn(),
    getDoc: vi.fn(() =>
        Promise.resolve({
            exists: () => true,
            data: () => ({ username: "Alice", email: "alice@example.com" }),
        }),
    ),
}));

vi.mock("../../configurations/firebase-config", () => ({
    auth: { currentUser: USER },
    db: {},
    googleAuthProvider: {},
    firebaseConfig: { authDomain: "example.firebaseapp.com" },
}));

vi.mock("firebase/auth", () => ({
    onAuthStateChanged: (_auth: unknown, callback: (user: typeof USER) => void) => {
        callback(USER);
        return () => {};
    },
    getRedirectResult: () => Promise.resolve(null),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn(),
    sendEmailVerification: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
    Timestamp: {
        fromDate: (date: Date) => ({
            __date: date,
            toMillis: () => date.getTime(),
            toDate: () => date,
        }),
    },
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
        path: segments.join("/"),
    })),
    getDoc,
    getDocs,
    getDocsFromServer: getDocs,
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(),
    deleteDoc: vi.fn(),
    deleteField: () => ({ __delete: true }),
    serverTimestamp: () => "SERVER_TIMESTAMP",
    increment: (by: number) => ({ __increment: by }),
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({
        path: segments.join("/"),
    })),
    query: vi.fn((ref: { path?: string }) => ({ path: ref?.path ?? "" })),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot,
    runTransaction: async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) => {
        const result = await callback({ get: transactionGet, set: batchSet, update: batchUpdate });
        await batchCommit();
        return result;
    },
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import { todayInputValue } from "../../model/Log";
import AddLog from "./AddLog";

const GROUP = {
    name: "Family Cars",
    ownerId: "alice-uid",
    memberIds: ["alice-uid"],
    members: { "alice-uid": { username: "Alice" } },
    canAddCars: ["alice-uid"],
    joinToken: "0123456789abcdef0123456789abcdef",
};

const CAR = {
    brand: "Perodua",
    model: "Myvi",
    year: 2018,
    nickname: "Mum's Myvi",
    odometer: 128400,
    access: {},
    lastByType: {},
    statusStamp: {},
    totalSpend: 0,
    createdBy: "alice-uid",
};

const emit = (car: Record<string, unknown> | null = CAR) => {
    transactionGet.mockResolvedValue({ exists: () => car !== null, data: () => car });
    onSnapshot.mockImplementation(
        (ref: { path?: string }, next: (snap: unknown) => void) => {
            const path = ref?.path ?? "";

            // Collections come back as `docs`; documents as a single snapshot.
            if (path.startsWith("notifications") || path.includes("/logs")) {
                next({ docs: [] });
                return () => {};
            }

            const isCar = path.includes("/cars/");
            const data = isCar ? car : GROUP;
            next({
                id: isCar ? "myvi" : "family-car",
                exists: () => data !== null,
                data: () => data,
            });
            return () => {};
        },
    );
};

const renderAddLog = () =>
    render(
        <MemoryRouter initialEntries={["/groups/family-car/cars/myvi/logs/new"]}>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <Routes>
                            <Route
                                path="/groups/:groupId/cars/:carId/logs/new"
                                element={<AddLog />}
                            />
                            <Route
                                path="/groups/:groupId/cars/:carId"
                                element={<p>car page</p>}
                            />
                        </Routes>
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

/** The fast path: type, cost, done. */
const fillMinimum = async (
    user: ReturnType<typeof userEvent.setup>,
    cost = "250.50",
) => {
    await user.selectOptions(
        screen.getByLabelText(strings.logs.typeLabel),
        "engine_oil",
    );
    await user.type(screen.getByLabelText(strings.logs.costLabel), cost);
};

const submit = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: new RegExp(strings.logs.save) }));

/**
 * Interval editor, notes and the bump-current-mileage checkbox all sit
 * behind "More options" since UX phase-2. Tests that touch those fields
 * expand it first — the happy path itself never does. [UX 2c]
 */
const openMore = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(
        screen.getByRole("button", { name: strings.logs.moreOptionsShow }),
    );

describe("AddLog [L1–L5]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        getDocs.mockClear();
        getDocs.mockResolvedValue({ docs: [] } as never);
        batchSet.mockClear();
        batchUpdate.mockClear();
        batchCommit.mockClear();
    });

    it("opens dated today with the car's reading prefilled [L2]", async () => {
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );

        expect(screen.getByLabelText(strings.logs.dateLabel)).toHaveValue(
            todayInputValue(),
        );
        expect(screen.getByLabelText(strings.logs.odometerLabel)).toHaveValue(
            "128400",
        );
    });

    it("prefills the preset's interval, and lets it be overridden [L4]", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );

        await user.selectOptions(
            screen.getByLabelText(strings.logs.typeLabel),
            "engine_oil",
        );
        // Interval fields live inside "More options" now — expand to check
        // that the preset seeded them, then flip to a months-only preset
        // and confirm the km box clears rather than keeping the last value.
        await openMore(user);
        expect(screen.getByLabelText(strings.logs.intervalKmLabel)).toHaveValue(
            "10000",
        );
        expect(screen.getByLabelText(strings.logs.intervalMonthsLabel)).toHaveValue(
            "6",
        );

        await user.selectOptions(
            screen.getByLabelText(strings.logs.typeLabel),
            "battery",
        );
        expect(screen.getByLabelText(strings.logs.intervalKmLabel)).toHaveValue("");
        expect(screen.getByLabelText(strings.logs.intervalMonthsLabel)).toHaveValue(
            "24",
        );
    });

    it("starts a custom entry with no interval, and asks what it was [L4]", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );

        await user.selectOptions(
            screen.getByLabelText(strings.logs.typeLabel),
            "custom",
        );

        expect(screen.getByLabelText(strings.logs.customLabel)).toBeInTheDocument();
        await openMore(user);
        expect(screen.getByLabelText(strings.logs.intervalKmLabel)).toHaveValue("");
        expect(screen.getByLabelText(strings.logs.intervalMonthsLabel)).toHaveValue(
            "",
        );
    });

    // ── The batch [S1, S2] ─────────────────────────────────────────────────

    /**
     * The heart of T12: one batch across three documents. T13 and T14 read the
     * denormalised fields and never the history, so a total that disagrees with
     * its logs is a wrong number on someone's home screen.
     */
    it("writes the entry, the car's totals and the group's spend in one batch", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );
        await fillMinimum(user);
        await submit(user);

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        // The entry.
        expect(batchSet.mock.calls[0][1]).toMatchObject({
            type: "engine_oil",
            cost: 250.5,
            intervalKm: 10000,
            intervalMonths: 6,
            createdBy: { uid: "alice-uid", username: "Alice" },
        });

        // The car: spend, and lastByType because this is the first of its type.
        const carUpdate = batchUpdate.mock.calls[0][1];
        expect(carUpdate.totalSpend).toEqual({ __increment: 250.5 });
        expect(carUpdate["lastByType.engine_oil"]).toMatchObject({
            odometer: 128400,
            intervalKm: 10000,
            intervalMonths: 6,
        });
        // spendByType denorm rides the same car update [SPD1, T20]
        expect(carUpdate["spendByType.engine_oil"]).toEqual({
            __increment: 250.5,
        });

        // The group: this year's bucket AND this month's bucket [SPD1, T20]
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, "0");
        expect(batchUpdate.mock.calls[1][1]).toEqual({
            [`spendByYear.${year}`]: { __increment: 250.5 },
            [`spendByMonth.${year}-${month}`]: { __increment: 250.5 },
        });
    });

    /**
     * Logging a service you forgot last year must not overwrite what next-due
     * is counting from.
     */
    it("keeps a newer reminder saved on another device while the form is open", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );
        await fillMinimum(user);

        const dateField = screen.getByLabelText(strings.logs.dateLabel);
        await user.clear(dateField);
        await user.type(dateField, "2025-01-15");
        transactionGet.mockResolvedValue({
            exists: () => true,
            data: () => ({
                ...CAR,
                lastByType: {
                    engine_oil: {
                        date: { toMillis: () => new Date("2026-06-01").getTime() },
                    },
                },
            }),
        });
        await submit(user);

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        const carUpdate = batchUpdate.mock.calls[0][1];
        expect(carUpdate.totalSpend).toEqual({ __increment: 250.5 });
        // Spend still moves; the next-due anchor does not.
        expect(carUpdate).not.toHaveProperty("lastByType.engine_oil");
    });

    it("buckets the spend by the entry's own year, not today's [S2]", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );
        await fillMinimum(user);

        const dateField = screen.getByLabelText(strings.logs.dateLabel);
        await user.clear(dateField);
        await user.type(dateField, "2025-03-04");
        await submit(user);

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
        expect(batchUpdate.mock.calls[1][1]).toEqual({
            "spendByYear.2025": { __increment: 250.5 },
            "spendByMonth.2025-03": { __increment: 250.5 },
        });
    });

    // ── The odometer offer ─────────────────────────────────────────────────

    it("offers to move the car's reading up, and does when accepted", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );
        await fillMinimum(user);

        const odometerField = screen.getByLabelText(strings.logs.odometerLabel);
        await user.clear(odometerField);
        await user.type(odometerField, "130000");

        // The bump-current-mileage checkbox lives inside "More options"
        // since UX phase-2 — Auntie doesn't see it by default, but its
        // ON-default still stands and still writes. [UX 2c]
        await openMore(user);
        const offer = screen.getByRole("checkbox");
        expect(offer).toBeChecked();

        await submit(user);
        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
        expect(batchUpdate.mock.calls[0][1].odometer).toBe(130000);
    });

    it("doesn't offer when the service reading isn't ahead", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );
        await fillMinimum(user);

        const odometerField = screen.getByLabelText(strings.logs.odometerLabel);
        await user.clear(odometerField);
        await user.type(odometerField, "100000");

        // Nothing to offer — the car already reads higher. Opening More
        // options confirms the checkbox isn't rendered at all in that case.
        await openMore(user);
        expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("respects the offer being declined", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );
        await fillMinimum(user);

        const odometerField = screen.getByLabelText(strings.logs.odometerLabel);
        await user.clear(odometerField);
        await user.type(odometerField, "130000");
        await openMore(user);
        await user.click(screen.getByRole("checkbox"));
        await submit(user);

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
        expect(batchUpdate.mock.calls[0][1]).not.toHaveProperty("odometer");
    });

    // ── Validation ─────────────────────────────────────────────────────────

    it("refuses a missing type or cost before any network call", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );
        await submit(user);

        expect(batchCommit).not.toHaveBeenCalled();
        expect(screen.getAllByText(strings.errors.required).length).toBeGreaterThan(
            0,
        );
    });

    it("refuses a non-numeric cost", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );
        await fillMinimum(user, "about two fifty");
        await submit(user);

        expect(batchCommit).not.toHaveBeenCalled();
        expect(screen.getByText(strings.errors.costInvalid)).toBeInTheDocument();
    });

    it("accepts a zero-cost service [L2]", async () => {
        const user = userEvent.setup();
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );
        // Warranty work, or a favour — legitimately free.
        await fillMinimum(user, "0");
        await submit(user);

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
        expect(batchSet.mock.calls[0][1].cost).toBe(0);
    });

    it("caps the date picker at today [L2]", async () => {
        emit();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.dateLabel)).toBeInTheDocument(),
        );
        // The native picker refuses the future before the rules have to.
        expect(screen.getByLabelText(strings.logs.dateLabel)).toHaveAttribute(
            "max",
            todayInputValue(),
        );
    });

    it("tells a member with no edit, rather than failing on submit [L1]", async () => {
        emit({ ...CAR, createdBy: "bob-uid" });
        onSnapshot.mockImplementation(
            (ref: { path?: string }, next: (snap: unknown) => void) => {
                const path = ref?.path ?? "";
                if (path.startsWith("notifications") || path.includes("/logs")) {
                    next({ docs: [] });
                    return () => {};
                }
                const isCar = path.includes("/cars/");
                const data = isCar
                    ? { ...CAR, createdBy: "bob-uid" }
                    : { ...GROUP, ownerId: "bob-uid" };
                next({ id: "x", exists: () => true, data: () => data });
                return () => {};
            },
        );
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.readOnlyNote)).toBeInTheDocument(),
        );
        expect(screen.queryByLabelText(strings.logs.typeLabel)).toBeNull();
    });
});

/**
 * The T16 edge sweep. [T16]
 *
 * A car whose odometer has never been set — which is every car added by
 * someone who ticked "leave it blank if you're not sure". The form has to work
 * without it rather than prefill a zero, because a zero here becomes the
 * reading next-due counts from. [C3, C9, R1]
 */
describe("AddLog — a car with no odometer [T16]", () => {
    const NO_READING = (() => {
        const { odometer: _odometer, ...rest } = CAR;
        return rest;
    })();

    beforeEach(() => {
        onSnapshot.mockReset();
        getDocs.mockClear();
        getDocs.mockResolvedValue({ docs: [] } as never);
        batchSet.mockClear();
        batchUpdate.mockClear();
        batchCommit.mockClear();
    });

    it("leaves the odometer field empty rather than prefilling zero", async () => {
        emit(NO_READING);
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );

        expect(screen.getByLabelText(strings.logs.odometerLabel)).toHaveValue("");
        // Nothing to move the car's reading UP to yet, so no offer to.
        expect(screen.queryByText(/Also set this car's current reading/)).toBeNull();
    });

    it("saves a service with no reading at all, and touches no odometer", async () => {
        emit(NO_READING);
        const user = userEvent.setup();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );

        await fillMinimum(user);
        await submit(user);

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        // The entry carries no odometer...
        const entry = batchSet.mock.calls[0][1] as Record<string, unknown>;
        expect(entry).not.toHaveProperty("odometer");
        // ...and the car's own reading is left alone rather than set to 0.
        const carUpdate = batchUpdate.mock.calls[0][1] as Record<string, unknown>;
        expect(carUpdate).not.toHaveProperty("odometer");
        expect(carUpdate.totalSpend).toEqual({ __increment: 250.5 });
    });

    it("still offers to set the car's first reading when one is typed", async () => {
        emit(NO_READING);
        const user = userEvent.setup();
        renderAddLog();

        await waitFor(() =>
            expect(screen.getByLabelText(strings.logs.typeLabel)).toBeInTheDocument(),
        );

        await fillMinimum(user);
        await user.type(
            screen.getByLabelText(strings.logs.odometerLabel),
            "128400",
        );

        // A car with no reading can take any first value — there is nothing
        // for it to go backwards from. [C9] The offer sits inside "More
        // options" since UX phase-2; expand to check it's still rendered.
        await openMore(user);
        expect(
            screen.getByText(
                strings.logs.bumpOdometer.replace("{km}", "128,400"),
            ),
        ).toBeInTheDocument();

        await submit(user);
        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        const carUpdate = batchUpdate.mock.calls[0][1] as Record<string, unknown>;
        expect(carUpdate.odometer).toBe(128400);
    });
});
