import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { USER, onSnapshot, getDoc, batchSet, batchUpdate, batchCommit } =
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
        getDoc: vi.fn(() =>
            Promise.resolve({
                exists: () => true,
                data: () => ({ username: "Alice", email: "alice@example.com" }),
            }),
        ),
        // The rename and every member's notification go in one batch. [G12]
        batchSet: vi.fn((_ref: unknown, _data: Record<string, unknown>) => {}),
        batchUpdate: vi.fn((_ref: unknown, _data: Record<string, unknown>) => {}),
        batchCommit: vi.fn(() => Promise.resolve()),
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

// Refs carry their path so the shared onSnapshot mock can tell the three
// listeners apart: the group document, the cars subcollection, and the
// pending-requests query.
vi.mock("firebase/firestore", () => ({
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
        kind: "doc",
        path: segments.join("/"),
    })),
    getDoc,
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    addDoc: vi.fn(),
    deleteDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    increment: vi.fn((by: number) => ({ __increment: by })),
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({
        kind: "collection",
        path: segments.join("/"),
    })),
    query: vi.fn((ref: { path?: string }) => ({
        kind: "query",
        path: ref?.path ?? "",
    })),
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
import GroupDetail from "./GroupDetail";

const OWNED_GROUP = {
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

const emitGroup = (
    data: Record<string, unknown> | null,
    cars: Array<{ id: string; data: Record<string, unknown> }> = [],
) => {
    onSnapshot.mockImplementation(
        (
            ref: { kind?: string; path?: string },
            next: (snap: unknown) => void,
        ) => {
            if (ref?.path?.includes("/cars")) {
                next({
                    docs: cars.map((car) => ({ id: car.id, data: () => car.data })),
                });
            } else if (ref?.kind === "query") {
                next({ docs: [] });
            } else {
                next({
                    id: "family-car",
                    exists: () => data !== null,
                    data: () => data,
                });
            }
            return () => {};
        },
    );
};

const renderDetail = () =>
    render(
        <MemoryRouter initialEntries={["/groups/family-car"]}>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <Routes>
                            <Route path="/groups/:groupId" element={<GroupDetail />} />
                            <Route path="/" element={<p>home screen</p>} />
                        </Routes>
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

/**
 * The group screen is the CARS space since Item 4. Members and Invitation moved
 * to their own routes — see GroupMembers.test.tsx for what left this page.
 */
describe("GroupDetail — the cars space [G2, Item 4]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        batchSet.mockClear();
        batchUpdate.mockClear();
        batchCommit.mockClear();
    });

    it("shows the group name and a summary", async () => {
        emitGroup(OWNED_GROUP);
        renderDetail();

        await waitFor(() =>
            expect(screen.getByText("Family Cars")).toBeInTheDocument(),
        );

        expect(screen.getByText("2 members")).toBeInTheDocument();
        expect(screen.getByText(strings.groups.summaryOwner)).toBeInTheDocument();
    });

    // ─── The cars space, filled in T9 ──────────────────────────────────────

    it("lists the group's cars [C10]", async () => {
        emitGroup(OWNED_GROUP, [
            {
                id: "myvi",
                data: {
                    brand: "Perodua",
                    model: "Myvi",
                    year: 2018,
                    nickname: "Mum's Myvi",
                    plate: "WXY 1234",
                    odometer: 128400,
                    createdBy: "alice-uid",
                },
            },
        ]);
        renderDetail();

        await waitFor(() =>
            expect(screen.getByText("Mum's Myvi")).toBeInTheDocument(),
        );

        // Post-redesign grammar [Group polish]: the row shows name on line 1
        // with the year muted inline after it, and a status line under it.
        // Plate and odometer moved OFF this row — the group index answers
        // "which of my cars needs attention next?", not "what are its
        // specs?", and the meta chips were competing with the status line
        // that carries the answer. Both still render on the car's own page
        // (plate in the hero card, odometer in CarStats).
        expect(screen.getByText("2018")).toBeInTheDocument();
        expect(screen.queryByText(strings.cars.emptyTitle)).toBeNull();
    });

    it("falls back to make and model when a car has no nickname", async () => {
        emitGroup(OWNED_GROUP, [
            {
                id: "saga",
                data: {
                    brand: "Proton",
                    model: "Saga",
                    year: 2021,
                    createdBy: "alice-uid",
                },
            },
        ]);
        renderDetail();

        await waitFor(() =>
            expect(screen.getByText("Proton Saga")).toBeInTheDocument(),
        );
    });

    it("offers Add car to a member with car-adding rights [C1]", async () => {
        emitGroup(OWNED_GROUP);
        renderDetail();

        await waitFor(() =>
            expect(
                screen.getByRole("link", { name: new RegExp(strings.cars.addButton) }),
            ).toHaveAttribute("href", "/groups/family-car/cars/new"),
        );
    });

    it("hides Add car from a member without the right, and says why", async () => {
        // Bob owns it and hasn't listed Alice in canAddCars.
        emitGroup({ ...OWNED_GROUP, ownerId: "bob-uid", canAddCars: ["bob-uid"] });
        renderDetail();

        await waitFor(() =>
            expect(screen.getByText(strings.cars.emptyTitle)).toBeInTheDocument(),
        );

        expect(
            screen.queryByRole("link", { name: new RegExp(strings.cars.addButton) }),
        ).toBeNull();
        expect(
            screen.getByText(strings.cars.emptyBodyReadOnly),
        ).toBeInTheDocument();
    });

    it("says you're a member, not an owner, when you don't own it", async () => {
        emitGroup({ ...OWNED_GROUP, ownerId: "bob-uid" });
        renderDetail();

        await waitFor(() =>
            expect(screen.getByText(strings.groups.summaryMember)).toBeInTheDocument(),
        );
    });

    // ─── Manage group entry [UX phase-2, polish] ─────────────────────────

    it("gives the owner a Manage button in the title row", async () => {
        emitGroup(OWNED_GROUP);
        renderDetail();

        await waitFor(() =>
            expect(
                screen.getByRole("link", {
                    name: new RegExp(strings.groups.manageEntry),
                }),
            ).toHaveAttribute("href", "/groups/family-car/manage"),
        );

        // Members and Invitation live inside /manage — none of the sub-
        // screens are linked from the day-to-day view any more.
        expect(
            screen.queryByRole("link", {
                name: new RegExp(strings.groups.navMembers),
            }),
        ).toBeNull();
        expect(
            screen.queryByRole("link", {
                name: new RegExp(strings.groups.navInvite),
            }),
        ).toBeNull();
    });

    it("does not render Manage for a plain member", async () => {
        emitGroup({ ...OWNED_GROUP, ownerId: "bob-uid" });
        renderDetail();

        await waitFor(() =>
            expect(screen.getByText("Family Cars")).toBeInTheDocument(),
        );
        expect(
            screen.queryByRole("link", {
                name: new RegExp(strings.groups.manageEntry),
            }),
        ).toBeNull();
    });

    it("surfaces pending requests in a banner above What's due for the owner", async () => {
        // One pending request. The owner-only usePendingRequests query hits
        // the query branch of the onSnapshot mock — see emitGroup's kind
        // check — so we override that here to hand back one request.
        onSnapshot.mockImplementation(
            (
                ref: { kind?: string; path?: string },
                next: (snap: unknown) => void,
            ) => {
                if (ref?.path?.includes("/cars")) {
                    next({ docs: [] });
                } else if (ref?.kind === "query") {
                    next({
                        docs: [
                            {
                                id: "req-1",
                                data: () => ({
                                    groupId: "family-car",
                                    uid: "dave-uid",
                                    username: "Dave",
                                    status: "pending",
                                }),
                            },
                        ],
                    });
                } else {
                    next({
                        id: "family-car",
                        exists: () => true,
                        data: () => OWNED_GROUP,
                    });
                }
                return () => {};
            },
        );
        renderDetail();

        // Banner is the primary signal. It's a link straight to /manage.
        const banner = await screen.findByRole("link", {
            name: new RegExp(strings.groups.pendingBannerOne),
        });
        expect(banner).toHaveAttribute("href", "/groups/family-car/manage");
        expect(
            screen.getByText(strings.groups.pendingBannerAction),
        ).toBeInTheDocument();
    });

    // Rename tests moved to GroupManage — GroupNameEditor no longer renders
    // on this page. See src/pages/GroupManage/ for what left this file.

    it("shows a neutral not-found state when the group is absent or denied", async () => {
        // A denied read surfaces the same way, so this never confirms existence.
        emitGroup(null);
        renderDetail();

        await waitFor(() =>
            expect(
                screen.getByText(strings.groups.notFoundTitle),
            ).toBeInTheDocument(),
        );
        expect(screen.getByText(strings.groups.notFoundBody)).toBeInTheDocument();
    });

    it("keeps /groups/:groupId working as the group's front door", async () => {
        // Invite links, notification targets and bookmarks minted before the
        // Item 4 split all point here. If this URL stopped resolving to the
        // group, every one of them would break.
        emitGroup(OWNED_GROUP);
        renderDetail();

        await waitFor(() =>
            expect(screen.getByText("Family Cars")).toBeInTheDocument(),
        );
    });
});
