import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { USER, onSnapshot, batchSet, batchUpdate, batchCommit, getDoc } =
    vi.hoisted(() => ({
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
        // The car and the group's carCount go in one batch. [P3a]
        batchSet: vi.fn((_ref: unknown, _data: Record<string, unknown>) => {}),
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
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(),
    addDoc: vi.fn(),
    deleteDoc: vi.fn(),
    serverTimestamp: () => "SERVER_TIMESTAMP",
    increment: (by: number) => ({ __increment: by }),
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({
        path: segments.join("/"),
    })),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot,
    writeBatch: vi.fn(() => ({
        set: batchSet,
        update: batchUpdate,
        delete: vi.fn(),
        commit: batchCommit,
    })),
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import AddCar from "./AddCar";

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

const emitGroup = (data: Record<string, unknown> | null) => {
    onSnapshot.mockImplementation(
        (ref: { path?: string } | undefined, next: (snap: unknown) => void) => {
            // TopBar joined this page in the polish pass, and it opens an
            // unread-notifications listener. That query resolves to an
            // undefined ref through the firestore mocks; answer it with an
            // empty query snapshot rather than the group document below.
            if (!ref?.path || ref.path.startsWith("notifications")) {
                next({ docs: [] });
                return () => {};
            }
            next({
                id: "family-car",
                exists: () => data !== null,
                data: () => data,
            });
            return () => {};
        },
    );
};

const renderAddCar = () =>
    render(
        <MemoryRouter initialEntries={["/groups/family-car/cars/new"]}>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <Routes>
                            <Route
                                path="/groups/:groupId/cars/new"
                                element={<AddCar />}
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

/** Fills the three required pickers with a real catalogue combination. */
const pickMyvi = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.selectOptions(
        screen.getByLabelText(strings.cars.brandLabel),
        "Perodua",
    );
    await user.selectOptions(
        screen.getByLabelText(strings.cars.modelLabel),
        "Myvi",
    );
    await user.selectOptions(screen.getByLabelText(strings.cars.yearLabel), "2018");
};

describe("AddCar [C1, C2, C3]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        batchSet.mockClear();
        batchUpdate.mockClear();
        batchCommit.mockClear();
    });

    it("narrows the pickers brand → model → year [C2]", async () => {
        const user = userEvent.setup();
        emitGroup(GROUP);
        renderAddCar();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.addTitle)).toBeInTheDocument(),
        );

        // Model and year are inert until the step above them is answered.
        expect(screen.getByLabelText(strings.cars.modelLabel)).toBeDisabled();
        expect(screen.getByLabelText(strings.cars.yearLabel)).toBeDisabled();

        await user.selectOptions(
            screen.getByLabelText(strings.cars.brandLabel),
            "Perodua",
        );

        const models = screen.getByLabelText(strings.cars.modelLabel);
        expect(models).toBeEnabled();
        expect(screen.getByRole("option", { name: "Myvi" })).toBeInTheDocument();
        // Another brand's models must not be reachable from here.
        expect(screen.queryByRole("option", { name: "Saga" })).toBeNull();
    });

    it("clears the model and year when the brand changes", async () => {
        const user = userEvent.setup();
        emitGroup(GROUP);
        renderAddCar();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.addTitle)).toBeInTheDocument(),
        );
        await pickMyvi(user);

        await user.selectOptions(
            screen.getByLabelText(strings.cars.brandLabel),
            "Proton",
        );

        // A Myvi with a Proton badge is not a state this form should reach.
        expect(screen.getByLabelText(strings.cars.modelLabel)).toHaveValue("");
        expect(screen.getByLabelText(strings.cars.yearLabel)).toHaveValue("");
    });

    it("writes the car and the group counter in one batch [P3a]", async () => {
        const user = userEvent.setup();
        emitGroup(GROUP);
        renderAddCar();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.addTitle)).toBeInTheDocument(),
        );
        await pickMyvi(user);

        await user.type(
            screen.getByLabelText(strings.cars.nicknameLabel),
            "Mum's Myvi",
        );
        await user.type(screen.getByLabelText(strings.cars.plateLabel), "wxy 1234");
        await user.type(
            screen.getByLabelText(strings.cars.odometerLabel),
            "128400",
        );

        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.cars.saveButton) }),
        );

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        expect(batchSet.mock.calls[0][1]).toMatchObject({
            brand: "Perodua",
            model: "Myvi",
            year: 2018,
            nickname: "Mum's Myvi",
            // Plates are read aloud and compared — normalise the case.
            plate: "WXY 1234",
            odometer: 128400,
            // Inert on arrival: no rights granted, no history, no spend.
            access: {},
            lastByType: {},
            statusStamp: {},
            totalSpend: 0,
            createdBy: "alice-uid",
        });
        expect(batchUpdate.mock.calls[0][1]).toEqual({
            carCount: { __increment: 1 },
        });
    });

    it("accepts a car with no optional fields at all [C3]", async () => {
        const user = userEvent.setup();
        emitGroup(GROUP);
        renderAddCar();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.addTitle)).toBeInTheDocument(),
        );
        await pickMyvi(user);
        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.cars.saveButton) }),
        );

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        const written = batchSet.mock.calls[0][1];
        expect(written).not.toHaveProperty("nickname");
        expect(written).not.toHaveProperty("plate");
        expect(written).not.toHaveProperty("odometer");
    });

    it("takes free text when the brand is Other [C2]", async () => {
        const user = userEvent.setup();
        emitGroup(GROUP);
        renderAddCar();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.addTitle)).toBeInTheDocument(),
        );

        await user.selectOptions(
            screen.getByLabelText(strings.cars.brandLabel),
            "Other",
        );

        // The model dropdown gives way to two text fields — a curated list
        // must never become a wall.
        expect(screen.queryByLabelText(strings.cars.modelLabel)).toBeNull();
        await user.type(
            screen.getByLabelText(strings.cars.brandOtherLabel),
            "Volkswagen",
        );
        await user.type(
            screen.getByLabelText(strings.cars.modelOtherLabel),
            "Golf",
        );
        await user.selectOptions(
            screen.getByLabelText(strings.cars.yearLabel),
            "2015",
        );

        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.cars.saveButton) }),
        );

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
        expect(batchSet.mock.calls[0][1]).toMatchObject({
            brand: "Volkswagen",
            model: "Golf",
            year: 2015,
        });
    });

    it("refuses a non-numeric odometer before it reaches the network", async () => {
        const user = userEvent.setup();
        emitGroup(GROUP);
        renderAddCar();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.addTitle)).toBeInTheDocument(),
        );
        await pickMyvi(user);
        await user.type(
            screen.getByLabelText(strings.cars.odometerLabel),
            "about 100k",
        );
        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.cars.saveButton) }),
        );

        expect(batchCommit).not.toHaveBeenCalled();
        expect(
            screen.getByText(strings.errors.odometerInvalid),
        ).toBeInTheDocument();
    });

    /**
     * The rules would refuse this write anyway — but a form that only fails on
     * submit teaches someone that the app is broken, not that they lack a
     * permission. [C1]
     */
    it("tells a member without car-adding rights, instead of a dead form", async () => {
        emitGroup({ ...GROUP, ownerId: "bob-uid", canAddCars: ["bob-uid"] });
        renderAddCar();

        await waitFor(() =>
            expect(
                screen.getByText(strings.cars.cannotAddTitle),
            ).toBeInTheDocument(),
        );

        expect(screen.queryByLabelText(strings.cars.brandLabel)).toBeNull();
        expect(
            screen.queryByRole("button", {
                name: new RegExp(strings.cars.saveButton),
            }),
        ).toBeNull();
    });

    it("shows a neutral not-found when the group is absent or denied", async () => {
        emitGroup(null);
        renderAddCar();

        await waitFor(() =>
            expect(
                screen.getByText(strings.groups.notFoundTitle),
            ).toBeInTheDocument(),
        );
    });
});
