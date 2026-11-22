import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    USER,
    onSnapshot,
    updateDoc,
    getDocs,
    batchDelete,
    batchUpdate,
    batchCommit,
    getDoc,
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
    // Typed params so `.mock.calls[n][1]` is the payload, not `never`.
    updateDoc: vi.fn((_ref: unknown, _data: Record<string, unknown>) =>
        Promise.resolve(),
    ),
    getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
    batchDelete: vi.fn((_ref: unknown) => {}),
    batchUpdate: vi.fn((_ref: unknown, _data: Record<string, unknown>) => {}),
    batchCommit: vi.fn(() => Promise.resolve()),
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
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
        path: segments.join("/"),
    })),
    getDoc,
    getDocs,
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc,
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
    writeBatch: vi.fn(() => ({
        set: vi.fn(),
        update: batchUpdate,
        delete: batchDelete,
        commit: batchCommit,
    })),
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import CarDetail from "./CarDetail";

const GROUP = {
    name: "Family Cars",
    ownerId: "alice-uid",
    memberIds: ["alice-uid", "bob-uid"],
    members: {
        "alice-uid": { username: "Alice" },
        "bob-uid": { username: "Bob" },
    },
    canAddCars: ["alice-uid"],
    joinToken: "0123456789abcdef0123456789abcdef",
};

const CAR = {
    brand: "Perodua",
    model: "Myvi",
    year: 2018,
    nickname: "Mum's Myvi",
    plate: "WXY 1234",
    odometer: 128400,
    access: {},
    lastByType: {},
    statusStamp: {},
    totalSpend: 0,
    createdBy: "alice-uid",
};

/**
 * Drives every listener the page mounts, told apart by path: the group doc, the
 * car doc, the top bar's notification query, and the car's log history — the
 * last two being COLLECTIONS, which throw if handed a document-shaped snapshot.
 */
const emit = (
    group: Record<string, unknown> | null,
    car: Record<string, unknown> | null,
) => {
    onSnapshot.mockImplementation(
        (ref: { path?: string }, next: (snap: unknown) => void) => {
            const path = ref?.path ?? "";

            // Collections answer with `docs`; documents with a snapshot. The
            // logs listener joined this page in T12; the parts listener in T18.
            if (
                path.startsWith("notifications") ||
                path.includes("/logs") ||
                path.includes("/parts")
            ) {
                next({ docs: [] });
                return () => {};
            }

            const isCar = path.includes("/cars/");
            const data = isCar ? car : group;
            next({
                id: isCar ? "myvi" : "family-car",
                exists: () => data !== null,
                data: () => data,
            });
            return () => {};
        },
    );
};

const renderCar = () =>
    render(
        <MemoryRouter initialEntries={["/groups/family-car/cars/myvi"]}>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <Routes>
                            <Route
                                path="/groups/:groupId/cars/:carId"
                                element={<CarDetail />}
                            />
                            <Route
                                path="/groups/:groupId"
                                element={<p>group screen</p>}
                            />
                        </Routes>
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

const openOdometer = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
        screen.getByRole("button", { name: strings.cars.odometerUpdate }),
    );
    return screen.getByLabelText(strings.cars.odometerLabel);
};

describe("CarDetail [C5, C8, C9, C10]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        updateDoc.mockClear();
        getDocs.mockClear();
        getDocs.mockResolvedValue({ docs: [] } as never);
        batchDelete.mockClear();
        batchUpdate.mockClear();
        batchCommit.mockClear();
    });

    it("shows the car's details and reading", async () => {
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Mum's Myvi" }),
            ).toBeInTheDocument(),
        );
        expect(screen.getByText("128,400 km")).toBeInTheDocument();
        expect(screen.getByText("WXY 1234")).toBeInTheDocument();
        // The nickname is the headline, so the make moves to the subtitle.
        expect(screen.getByText("Perodua Myvi · 2018")).toBeInTheDocument();
    });

    it("doesn't repeat the make when there's no nickname", async () => {
        const { nickname: _nickname, ...noNickname } = CAR;
        emit(GROUP, noNickname);
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Perodua Myvi" }),
            ).toBeInTheDocument(),
        );
        // The year appears as a fact regardless; what must NOT appear is the
        // make repeated under a headline that already says it.
        expect(screen.queryByText("Perodua Myvi · 2018")).toBeNull();
    });

    it("shows a neutral not-found when the car is absent or denied", async () => {
        emit(GROUP, null);
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByText(strings.groups.notFoundTitle),
            ).toBeInTheDocument(),
        );
    });

    // ── Odometer [C9] ──────────────────────────────────────────────────────

    it("saves a higher reading straight away", async () => {
        const user = userEvent.setup();
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(screen.getByText("128,400 km")).toBeInTheDocument(),
        );

        const field = await openOdometer(user);
        await user.clear(field);
        await user.type(field, "130000");
        await user.click(
            screen.getByRole("button", { name: strings.cars.odometerSave }),
        );

        await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
        expect(updateDoc.mock.calls[0][1]).toEqual({
            odometer: 130000,
            odometerReading: { value: 130000, at: "SERVER_TIMESTAMP" },
        });
    });

    /**
     * The guard. A lower reading is either a typo or a correction, and the
     * difference matters — so nothing is written until someone says which.
     */
    it("asks before accepting a lower reading, and writes nothing yet", async () => {
        const user = userEvent.setup();
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(screen.getByText("128,400 km")).toBeInTheDocument(),
        );

        const field = await openOdometer(user);
        await user.clear(field);
        await user.type(field, "1000");
        await user.click(
            screen.getByRole("button", { name: strings.cars.odometerSave }),
        );

        expect(updateDoc).not.toHaveBeenCalled();
        expect(
            screen.getByText(strings.cars.odometerLowerTitle),
        ).toBeInTheDocument();
    });

    it("stamps the correction once it's confirmed", async () => {
        const user = userEvent.setup();
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(screen.getByText("128,400 km")).toBeInTheDocument(),
        );

        const field = await openOdometer(user);
        await user.clear(field);
        await user.type(field, "1000");
        await user.click(
            screen.getByRole("button", { name: strings.cars.odometerSave }),
        );
        await user.click(
            screen.getByRole("button", { name: strings.cars.odometerLowerConfirm }),
        );

        await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
        // The stamp is what the rules require on a decrease — without it the
        // write is refused.
        expect(updateDoc.mock.calls[0][1]).toEqual({
            odometer: 1000,
            odometerReading: { value: 1000, at: "SERVER_TIMESTAMP" },
            odometerCorrectedAt: "SERVER_TIMESTAMP",
        });
    });

    it("never stamps a correction on an increase", async () => {
        const user = userEvent.setup();
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(screen.getByText("128,400 km")).toBeInTheDocument(),
        );

        const field = await openOdometer(user);
        await user.clear(field);
        await user.type(field, "200000");
        await user.click(
            screen.getByRole("button", { name: strings.cars.odometerSave }),
        );

        await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
        expect(updateDoc.mock.calls[0][1]).not.toHaveProperty(
            "odometerCorrectedAt",
        );
    });

    it("refuses a non-numeric reading without writing", async () => {
        const user = userEvent.setup();
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(screen.getByText("128,400 km")).toBeInTheDocument(),
        );

        const field = await openOdometer(user);
        await user.clear(field);
        await user.type(field, "about 130k");
        await user.click(
            screen.getByRole("button", { name: strings.cars.odometerSave }),
        );

        expect(updateDoc).not.toHaveBeenCalled();
        expect(
            screen.getByText(strings.errors.odometerInvalid),
        ).toBeInTheDocument();
    });

    // ── Permissions [C6, C8] ───────────────────────────────────────────────

    it("hides every control from a member with no edit, and says why", async () => {
        // Bob owns the group and created the car; Alice is just a member.
        emit(
            { ...GROUP, ownerId: "bob-uid" },
            { ...CAR, createdBy: "bob-uid" },
        );
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Mum's Myvi" }),
            ).toBeInTheDocument(),
        );

        expect(
            screen.queryByRole("button", { name: strings.cars.odometerUpdate }),
        ).toBeNull();
        expect(
            screen.queryByRole("link", { name: new RegExp(strings.cars.editButton) }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: new RegExp(strings.cars.photoAdd) }),
        ).toBeNull();
        expect(screen.getByText(strings.cars.readOnlyNote)).toBeInTheDocument();
    });

    it("lets an elevated member edit but not delete [C8]", async () => {
        // Bob owns the group and created the car; Alice was granted edit.
        emit(
            { ...GROUP, ownerId: "bob-uid" },
            { ...CAR, createdBy: "bob-uid", access: { "alice-uid": "edit" } },
        );
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: strings.cars.odometerUpdate }),
            ).toBeInTheDocument(),
        );

        // Deleting takes the whole history with it — that stays with the owner
        // and the creator.
        expect(screen.queryByText(strings.cars.deleteTitle)).toBeNull();
    });

    // ── Delete [C8] ────────────────────────────────────────────────────────

    it("never deletes on the first click", async () => {
        const user = userEvent.setup();
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: new RegExp(strings.cars.deleteButton) }),
            ).toBeInTheDocument(),
        );

        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.cars.deleteButton) }),
        );

        expect(batchCommit).not.toHaveBeenCalled();
        // Prompt names the car since the car-polish pass, so the assertion
        // has to fill in the same {car} placeholder the component does.
        expect(
            screen.getByText(
                strings.cars.deleteConfirmPrompt.replace("{car}", "Mum's Myvi"),
            ),
        ).toBeInTheDocument();
    });

    it("deletes the car with its logs and the counter, then goes back", async () => {
        const user = userEvent.setup();
        // Two logs, then an empty parts subcollection — the cascade reads
        // both before the car itself, in that order.
        getDocs
            .mockResolvedValueOnce({
                docs: [{ ref: { path: "log-1" } }, { ref: { path: "log-2" } }],
            } as never)
            .mockResolvedValueOnce({ docs: [] } as never);
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: new RegExp(strings.cars.deleteButton) }),
            ).toBeInTheDocument(),
        );

        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.cars.deleteButton) }),
        );
        await user.click(
            screen.getByRole("button", { name: strings.cars.deleteConfirmButton }),
        );

        // Firestore never cascades, so the logs go explicitly — otherwise they
        // sit unreachable under a car that no longer exists. The parts
        // subcollection is now part of the cascade too (T18): logs batch +
        // car+counter batch = 2 commits when parts are empty.
        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(2));
        expect(batchDelete).toHaveBeenCalledTimes(3); // 2 logs + the car
        expect(batchUpdate.mock.calls[0][1]).toEqual({
            carCount: { __increment: -1 },
        });

        await waitFor(() =>
            expect(screen.getByText("group screen")).toBeInTheDocument(),
        );
    });
});

/**
 * The T16 edge sweep. [T16]
 *
 * Every one of these is a state a family will actually reach — a car deleted
 * on one phone while another is looking at it, a car nobody has logged
 * anything against yet, access revoked while the holder has the page open —
 * and every one of them used to be reasoned about rather than tested.
 */
describe("CarDetail — edges [T16]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        updateDoc.mockClear();
        getDocs.mockClear();
        getDocs.mockResolvedValue({ docs: [] } as never);
        batchDelete.mockClear();
        batchUpdate.mockClear();
        batchCommit.mockClear();
    });

    /**
     * Someone else deletes the car while this page is open. The listener
     * reports a document that no longer exists, which has to read as the
     * neutral not-found rather than throwing on `car.brand`.
     */
    it("degrades to not-found when the car is deleted mid-view", async () => {
        // A single implementation whose answer changes between emissions, so
        // the page genuinely transitions rather than starting in the end state.
        let carExists = true;
        onSnapshot.mockImplementation(
            (ref: { path?: string }, next: (snap: unknown) => void) => {
                const path = ref?.path ?? "";
                if (
                    path.startsWith("notifications") ||
                    path.includes("/logs") ||
                    path.includes("/parts")
                ) {
                    next({ docs: [] });
                    return () => {};
                }
                const isCar = path.includes("/cars/");
                const data = isCar ? (carExists ? CAR : null) : GROUP;
                next({
                    id: isCar ? "myvi" : "family-car",
                    exists: () => data !== null,
                    data: () => data,
                });
                return () => {};
            },
        );

        const { rerender } = renderCar();
        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Mum's Myvi" }),
            ).toBeInTheDocument(),
        );

        carExists = false;
        rerender(<div />);
        renderCar();

        await waitFor(() =>
            expect(
                screen.getAllByText(strings.groups.notFoundTitle).length,
            ).toBeGreaterThan(0),
        );
    });

    /**
     * A car with no history at all — the state every car is in on the day it
     * is added. Three separate surfaces have to handle the emptiness rather
     * than render a zero or a blank row: next-due, spend, and the history.
     */
    it("handles a car with no logs on every surface at once", async () => {
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Mum's Myvi" }),
            ).toBeInTheDocument(),
        );

        // Next-due says what to do about it, rather than showing nothing.
        expect(screen.getByText(strings.due.noneTracked)).toBeInTheDocument();
        // The history offers the first entry.
        expect(screen.getByText(strings.logs.emptyTitle)).toBeInTheDocument();

        // The by-type BREAKDOWN renders nothing — a whole panel reading
        // RM 0 on a car nobody has spent on is explaining a feature, not
        // reporting a fact. [S1]
        expect(screen.queryByText(strings.spend.breakdownTitle)).toBeNull();

        // The stat row still shows RM 0, and that is not the same thing.
        // It's half of a row that exists anyway for the odometer, so the
        // choice is between a real zero and a hole in the layout — and "this
        // car has cost nothing yet" is a fact about a new car, not a feature
        // demo. The objection above was to the PANEL, not to the figure.
        // Headline uses noDecimals since the car polish pass, matching how
        // Group/Home already render their totals.
        expect(screen.getByText(strings.spend.carTitle)).toBeInTheDocument();
        expect(screen.getByText("RM 0")).toBeInTheDocument();
    });

    /** A car that has never had its odometer set. [C9] */
    it("says the reading isn't recorded rather than showing 0 km", async () => {
        const { odometer: _odometer, ...noReading } = CAR;
        emit(GROUP, noReading);
        renderCar();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.odometerNone)).toBeInTheDocument(),
        );
        expect(screen.queryByText("0 km")).toBeNull();
    });

    /**
     * Access revoked while the holder has the page open.
     *
     * The controls come off on the next snapshot rather than waiting for a
     * write to bounce — `canEdit` is derived from the live car document, so
     * the revocation IS the re-render. The rules refuse the write either way;
     * this is about not offering a button that can only fail.
     */
    it("takes the controls away when edit access is revoked live", async () => {
        // Bob holds edit through the access map, and the group is Alice's.
        const bobGroup = { ...GROUP, ownerId: "carol-uid" };
        const granted = { ...CAR, createdBy: "carol-uid", access: { "alice-uid": "edit" } };
        const revoked = { ...CAR, createdBy: "carol-uid", access: {} };

        let hasAccess = true;
        onSnapshot.mockImplementation(
            (ref: { path?: string }, next: (snap: unknown) => void) => {
                const path = ref?.path ?? "";
                if (
                    path.startsWith("notifications") ||
                    path.includes("/logs") ||
                    path.includes("/parts")
                ) {
                    next({ docs: [] });
                    return () => {};
                }
                const isCar = path.includes("/cars/");
                const data = isCar ? (hasAccess ? granted : revoked) : bobGroup;
                next({
                    id: isCar ? "myvi" : "family-car",
                    exists: () => true,
                    data: () => data,
                });
                return () => {};
            },
        );

        const { unmount } = renderCar();
        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: strings.cars.odometerUpdate }),
            ).toBeInTheDocument(),
        );
        unmount();

        hasAccess = false;
        renderCar();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.readOnlyNote)).toBeInTheDocument(),
        );
        expect(
            screen.queryByRole("button", { name: strings.cars.odometerUpdate }),
        ).toBeNull();
        // And no way in to logging a service either. [L1]
        expect(
            screen.queryByRole("link", { name: new RegExp(strings.logs.addButton) }),
        ).toBeNull();
    });
});

/**
 * The page's shape, pinned. [Batch 2]
 *
 * Order is a product decision here, not an accident of which component was
 * written first — the page answers "what has been done to this car", so the
 * history sits directly under the photo and the numbers follow it. A refactor
 * that quietly restores the old order (odometer and spend above the history)
 * would pass every other test in this file.
 */
describe("CarDetail — hierarchy [Batch 2]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        updateDoc.mockClear();
        getDocs.mockClear();
        getDocs.mockResolvedValue({ docs: [] } as never);
    });

    /** Where each landmark sits in document order. */
    const positionOf = (text: string): number => {
        const node = screen.getByText(text);
        const all = Array.from(document.querySelectorAll("*"));
        return all.indexOf(node.closest("section, header") ?? node);
    };

    it("puts the photo, then the history, then the supporting numbers", async () => {
        emit(GROUP, { ...CAR, totalSpend: 450 });
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Mum's Myvi" }),
            ).toBeInTheDocument(),
        );

        const history = positionOf(strings.logs.historyTitle);
        const odometer = positionOf(strings.cars.odometerTitle);
        // deleteTitle ("Delete car") is also the button label since the
        // car polish pass, so scope to the heading role to avoid the
        // getByText ambiguity — the section-position semantics are the
        // same either way.
        const dangerHeading = screen.getByRole("heading", {
            name: strings.cars.deleteTitle,
            level: 2,
        });
        const dangerAll = Array.from(document.querySelectorAll("*"));
        const danger = dangerAll.indexOf(
            dangerHeading.closest("section, header") ?? dangerHeading,
        );

        // The history comes BEFORE the odometer — this is the whole point of
        // the restructure, and it was the other way round.
        expect(history).toBeLessThan(odometer);
        // And the numbers sit above the destructive action, which stays last.
        expect(odometer).toBeLessThan(danger);
    });

    /**
     * The car page is about servicing, so it carries no read-only spec sheet.
     * Brand, model, year, plate, nickname and added-by rendered as a fact grid
     * at the bottom; every one of them is in the header already or on the edit
     * screen, which is where you go to change them.
     */
    it("shows no details panel at all", async () => {
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Mum's Myvi" }),
            ).toBeInTheDocument(),
        );

        // Literal text on purpose: the locale keys were deleted along with the
        // panel, so asserting through `strings` would only prove the constants
        // are gone, not the markup.
        expect(screen.queryByText("Details")).toBeNull();
        expect(screen.queryByText("Make & model")).toBeNull();
        expect(screen.queryByText("Nickname")).toBeNull();
        expect(screen.queryByText(/Added by/)).toBeNull();
    });

    it("keeps the plate in the header, as identity rather than detail", async () => {
        // A family with two Myvis needs to know which one this page is about.
        emit(GROUP, CAR);
        renderCar();

        const plate = await screen.findByText("WXY 1234");
        expect(plate.closest("header")).not.toBeNull();
    });

    it("offers Edit from the car's header", async () => {
        emit(GROUP, CAR);
        renderCar();

        const edit = await screen.findByRole("link", {
            name: new RegExp(strings.cars.editButton),
        });

        // In the header, which is the element carrying the car's name — the
        // details panel it used to live in no longer exists at all.
        expect(edit.closest("header")).not.toBeNull();
    });

    it("renders the odometer as a stat rather than a panel of its own", async () => {
        emit(GROUP, CAR);
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Mum's Myvi" }),
            ).toBeInTheDocument(),
        );

        // Odometer and spend share one section — they are peers now, and a
        // reading with its own card is what made it read as the headline.
        const odometerSection = screen
            .getByText(strings.cars.odometerTitle)
            .closest("section");

        expect(odometerSection).toContainElement(
            screen.getByText(strings.spend.carTitle),
        );
    });
    /**
     * "Never nest a panel inside a panel" is a hard mobile rule in CLAUDE.md,
     * and the restructure added a panel (CarStats) and moved three others. A
     * nested card double-pads its contents, which costs ~32px of a 375px
     * screen and reads as a boundary that means nothing.
     */
    it("nests no panel inside another panel", async () => {
        emit(GROUP, { ...CAR, totalSpend: 450 });
        renderCar();

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Mum's Myvi" }),
            ).toBeInTheDocument(),
        );

        const PANEL = [
            ".app-panel",
            ".logs-panel",
            ".spend-panel",
            ".car-stats",
            ".car-details",
            ".car-photo-panel",
        ].join(",");

        const nested = Array.from(document.querySelectorAll(PANEL)).filter(
            (panel) => panel.parentElement?.closest(PANEL),
        );

        expect(nested.map((node) => node.className)).toEqual([]);
    });
});
