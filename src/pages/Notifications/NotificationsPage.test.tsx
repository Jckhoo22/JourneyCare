import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatUnreadBadge } from "../../model/Notification";
import { PAGE_SIZE } from "../../controller/NotificationsController";

const { USER, onSnapshot, batchUpdate, batchCommit, getDoc } = vi.hoisted(() => ({
    USER: {
        uid: "owner-uid",
        email: "owner@example.com",
        displayName: "Owner",
        photoURL: "",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
        reload: vi.fn(() => Promise.resolve()),
    },
    onSnapshot: vi.fn(),
    batchUpdate: vi.fn((_ref: unknown, _data: Record<string, unknown>) => {}),
    batchCommit: vi.fn(() => Promise.resolve()),
    getDoc: vi.fn(() =>
        Promise.resolve({
            exists: () => true,
            data: () => ({ username: "Owner", email: "owner@example.com" }),
        }),
    ),
}));

vi.mock("../../configurations/firebase-config", () => ({
    auth: { currentUser: USER },
    db: {},
    googleAuthProvider: {},
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
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    getDoc,
    getDocs: vi.fn(),
    addDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    onSnapshot,
    serverTimestamp: () => "SERVER_TIMESTAMP",
    writeBatch: vi.fn(() => ({
        set: vi.fn(),
        update: batchUpdate,
        commit: batchCommit,
    })),
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import NotificationsPage from "./NotificationsPage";

interface Item {
    id: string;
    type: string;
    read: boolean;
    groupId?: string;
    username?: string;
    /** group_renamed [G12] */
    oldName?: string;
    newName?: string;
    /** access_changed [N6] and the due types [R4] */
    carId?: string;
    carName?: string;
    granted?: boolean;
    typeLabel?: string;
    dueLabel?: string;
}

const emit = (items: Item[]) => {
    onSnapshot.mockImplementation(
        (_ref: unknown, next: (snap: unknown) => void) => {
            next({
                docs: items.map((item) => ({
                    id: item.id,
                    data: () => ({
                        type: item.type,
                        read: item.read,
                        payload: {
                            groupId: item.groupId ?? "family-car",
                            groupName: "Family Cars",
                            username: item.username,
                            oldName: item.oldName,
                            newName: item.newName,
                            carId: item.carId,
                            carName: item.carName,
                            granted: item.granted,
                            typeLabel: item.typeLabel,
                            dueLabel: item.dueLabel,
                        },
                        createdAt: null,
                    }),
                })),
            });
            return () => {};
        },
    );
};

/**
 * Every destination a notification can reach, stubbed — so a tap that lands on
 * the WRONG one is a visible failure rather than a silent pass. The member and
 * car routes are declared before the group route's index so react router's
 * static-beats-dynamic ranking resolves them the way the real app does.
 */
const renderPage = () =>
    render(
        <MemoryRouter initialEntries={["/notifications"]}>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <Routes>
                            <Route
                                path="/notifications"
                                element={<NotificationsPage />}
                            />
                            <Route
                                path="/groups/:groupId"
                                element={<p>group detail</p>}
                            />
                            <Route
                                path="/groups/:groupId/members"
                                element={<p>members screen</p>}
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

/** Taps a row by its rendered sentence. */
const tap = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
    await user.click(screen.getByText(text));
};

describe("formatUnreadBadge [N2]", () => {
    it("is exact to 99, then caps", () => {
        expect(formatUnreadBadge(0)).toBe("0");
        expect(formatUnreadBadge(1)).toBe("1");
        expect(formatUnreadBadge(99)).toBe("99");
        expect(formatUnreadBadge(100)).toBe("99+");
        expect(formatUnreadBadge(4000)).toBe("99+");
    });
});

describe("NotificationsPage [N3, N4]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        batchUpdate.mockClear();
        batchCommit.mockClear();
    });

    it("shows an empty state rather than nothing", async () => {
        emit([]);
        renderPage();

        await waitFor(() =>
            expect(
                screen.getByText(strings.notifications.emptyTitle),
            ).toBeInTheDocument(),
        );
        expect(
            screen.getByText(strings.notifications.emptyBody),
        ).toBeInTheDocument();
    });

    /**
     * All eight types in one render. [T15]
     *
     * The property under test is that every one of them reads as a sentence
     * about people and things — a name, a group, a car — and that no raw
     * document id ever reaches the screen.
     */
    it("renders every type as a readable sentence, with no raw ids", async () => {
        emit([
            { id: "n1", type: "join_request", read: false, username: "Alex" },
            { id: "n2", type: "request_accepted", read: true },
            { id: "n3", type: "request_declined", read: true },
            { id: "n4", type: "removed_from_group", read: true },
            {
                id: "n5",
                type: "group_renamed",
                read: true,
                username: "Alex",
                oldName: "Old Name",
                newName: "Family Cars",
            },
            {
                id: "n6",
                type: "access_changed",
                read: true,
                granted: true,
                carId: "myvi",
                carName: "Mum's Myvi",
            },
            {
                id: "n7",
                type: "access_changed",
                read: true,
                granted: false,
                carId: "saga",
                carName: "The Saga",
            },
            {
                id: "n8",
                type: "due_soon",
                read: true,
                carId: "myvi",
                carName: "Mum's Myvi",
                typeLabel: "Engine oil",
                dueLabel: "Due by 15 Aug 2026",
            },
            {
                id: "n9",
                type: "overdue",
                read: true,
                carId: "saga",
                carName: "The Saga",
                typeLabel: "Brake pads",
                dueLabel: "Due at 52,000 km",
            },
        ]);
        renderPage();

        await waitFor(() =>
            expect(
                screen.getByText("Alex wants to join Family Cars"),
            ).toBeInTheDocument(),
        );
        expect(
            screen.getByText(/Your request to join Family Cars was accepted/),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Your request to join Family Cars was declined"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("You were removed from Family Cars"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Alex renamed Old Name to Family Cars"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("You can now edit Mum's Myvi in Family Cars"),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Your edit access to The Saga in Family Cars was removed",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Engine oil on Mum's Myvi is due soon — Due by 15 Aug 2026",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Brake pads on The Saga is overdue — Due at 52,000 km",
            ),
        ).toBeInTheDocument();

        // No document id leaks into the copy. These are the ids in the payloads
        // above; a template that dropped a name would surface one of them.
        const list = screen.getByRole("list");
        expect(list.textContent).not.toContain("family-car");
        expect(list.textContent).not.toContain("myvi");
        expect(list.textContent).not.toContain("saga");
    });

    /**
     * A type this build predates — an old tab still open across a deploy. It
     * used to be coerced into `join_request`, which put words in someone's
     * mouth; indexing the icon map with it would have thrown mid-render.
     */
    it("degrades an unrecognised type instead of guessing or crashing", async () => {
        emit([{ id: "n1", type: "some_future_type", read: false }]);
        renderPage();

        await waitFor(() =>
            expect(
                screen.getByText("Something happened in Family Cars"),
            ).toBeInTheDocument(),
        );
        expect(screen.queryByText(/wants to join/)).toBeNull();
    });
});

/**
 * Where each type sends you. [T15]
 *
 * A notification's whole job is to be actionable, and "actionable" is a
 * different screen per type — the owner's next move on a join request is
 * Accept, which lives on the members screen, not on the group's front page.
 */
describe("NotificationsPage — deep-link targets [N3, T15]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        batchUpdate.mockClear();
        batchCommit.mockClear();
    });

    it("sends a join request to the MEMBERS screen, where Accept lives", async () => {
        emit([{ id: "n1", type: "join_request", read: false, username: "Alex" }]);
        const user = userEvent.setup();
        renderPage();

        await tap(user, "Alex wants to join Family Cars");

        await waitFor(() => expect(batchCommit).toHaveBeenCalled());
        expect(batchUpdate).toHaveBeenCalledWith(expect.anything(), {
            read: true,
        });
        await waitFor(() =>
            expect(screen.getByText("members screen")).toBeInTheDocument(),
        );
    });

    it("sends an acceptance to the group they just joined", async () => {
        emit([{ id: "n1", type: "request_accepted", read: false }]);
        const user = userEvent.setup();
        renderPage();

        await tap(user, "You're in! Your request to join Family Cars was accepted");

        await waitFor(() =>
            expect(screen.getByText("group detail")).toBeInTheDocument(),
        );
    });

    it("sends a rename to the group", async () => {
        emit([
            {
                id: "n1",
                type: "group_renamed",
                read: false,
                username: "Alex",
                oldName: "Old Name",
                newName: "Family Cars",
            },
        ]);
        const user = userEvent.setup();
        renderPage();

        await tap(user, "Alex renamed Old Name to Family Cars");

        await waitFor(() =>
            expect(screen.getByText("group detail")).toBeInTheDocument(),
        );
    });

    /**
     * The T15 fix: this used to land on the group page, leaving someone told
     * about one car to go find it in a list.
     */
    it("sends an access change to the CAR it names", async () => {
        emit([
            {
                id: "n1",
                type: "access_changed",
                read: false,
                granted: true,
                carId: "myvi",
                carName: "Mum's Myvi",
            },
        ]);
        const user = userEvent.setup();
        renderPage();

        await tap(user, "You can now edit Mum's Myvi in Family Cars");

        await waitFor(() =>
            expect(screen.getByText("car page")).toBeInTheDocument(),
        );
    });

    it("sends a due reminder to the CAR that needs the service", async () => {
        emit([
            {
                id: "n1",
                type: "overdue",
                read: false,
                carId: "saga",
                carName: "The Saga",
                typeLabel: "Brake pads",
                dueLabel: "Due at 52,000 km",
            },
        ]);
        const user = userEvent.setup();
        renderPage();

        await tap(user, "Brake pads on The Saga is overdue — Due at 52,000 km");

        await waitFor(() =>
            expect(screen.getByText("car page")).toBeInTheDocument(),
        );
    });

    /**
     * The two dead ends, and why they are dead ends rather than links: both go
     * to somebody who is NOT in the group, so every destination inside it
     * resolves to "not found" — which reads as a broken app, not as an answer.
     * They still mark themselves read, so the badge clears.
     */
    it("does not navigate to a group you were removed from", async () => {
        emit([{ id: "n1", type: "removed_from_group", read: false }]);
        const user = userEvent.setup();
        renderPage();

        await tap(user, "You were removed from Family Cars");

        await waitFor(() => expect(batchCommit).toHaveBeenCalled());
        expect(screen.queryByText("group detail")).toBeNull();
        expect(screen.queryByText("members screen")).toBeNull();
    });

    it("does not navigate on a declined request either", async () => {
        emit([{ id: "n1", type: "request_declined", read: false }]);
        const user = userEvent.setup();
        renderPage();

        await tap(user, "Your request to join Family Cars was declined");

        await waitFor(() => expect(batchCommit).toHaveBeenCalled());
        expect(screen.queryByText("group detail")).toBeNull();
    });

    it("goes nowhere when the payload has no group at all", async () => {
        // A hand-authored or truncated document. The row still marks read, so
        // it can't sit in the badge forever.
        emit([{ id: "n1", type: "request_accepted", read: false, groupId: "" }]);
        const user = userEvent.setup();
        renderPage();

        await tap(
            user,
            "You're in! Your request to join Family Cars was accepted",
        );

        await waitFor(() => expect(batchCommit).toHaveBeenCalled());
        expect(screen.queryByText("group detail")).toBeNull();
    });
});

describe("NotificationsPage — the list itself [N3, N4]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        batchUpdate.mockClear();
        batchCommit.mockClear();
    });

    it("offers Mark all read only while something is unread", async () => {
        emit([{ id: "n1", type: "request_accepted", read: true }]);
        renderPage();

        await waitFor(() =>
            expect(
                screen.getByText(/Your request to join Family Cars was accepted/),
            ).toBeInTheDocument(),
        );
        expect(
            screen.queryByRole("button", {
                name: strings.notifications.markAllRead,
            }),
        ).toBeNull();
    });

    /**
     * The pagination bound. [N4]
     *
     * `hasMore` is "the page came back full", which is the only signal a
     * bounded listener has — asking whether more exists would mean an
     * unbounded read, which is the trap this project has already been bitten
     * by. It over-offers by one page in the exact-multiple case; the cost is a
     * button that loads nothing, which is cheaper than the alternative.
     */
    it("offers Load older exactly when a page comes back full", async () => {
        emit(
            Array.from({ length: PAGE_SIZE }, (_, at) => ({
                id: `n${at}`,
                type: "request_accepted",
                read: true,
            })),
        );
        renderPage();

        await waitFor(() =>
            expect(
                screen.getByRole("button", {
                    name: strings.notifications.loadMore,
                }),
            ).toBeInTheDocument(),
        );
    });

    it("does not offer it on a part-full page", async () => {
        emit(
            Array.from({ length: PAGE_SIZE - 1 }, (_, at) => ({
                id: `n${at}`,
                type: "request_accepted",
                read: true,
            })),
        );
        renderPage();

        await waitFor(() =>
            expect(screen.getAllByRole("listitem")).toHaveLength(PAGE_SIZE - 1),
        );
        expect(
            screen.queryByRole("button", {
                name: strings.notifications.loadMore,
            }),
        ).toBeNull();
    });

    /** Unread math is over the loaded page, and counts only what is unread. */
    it("counts unread across a mixed list of every type", async () => {
        emit([
            { id: "n1", type: "join_request", read: false, username: "Alex" },
            { id: "n2", type: "request_accepted", read: true },
            {
                id: "n3",
                type: "overdue",
                read: false,
                carId: "saga",
                carName: "The Saga",
                typeLabel: "Brake pads",
                dueLabel: "Due now",
            },
            {
                id: "n4",
                type: "access_changed",
                read: true,
                granted: true,
                carId: "myvi",
                carName: "Mum's Myvi",
            },
        ]);
        const user = userEvent.setup();
        renderPage();

        await waitFor(() =>
            expect(
                screen.getByRole("button", {
                    name: strings.notifications.markAllRead,
                }),
            ).toBeInTheDocument(),
        );

        await user.click(
            screen.getByRole("button", {
                name: strings.notifications.markAllRead,
            }),
        );

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
        // The two unread ones, and neither of the two already read.
        expect(batchUpdate).toHaveBeenCalledTimes(2);
    });

    it("marks everything unread in one batch", async () => {
        emit([
            { id: "n1", type: "join_request", read: false, username: "Alex" },
            { id: "n2", type: "join_request", read: false, username: "Sam" },
            { id: "n3", type: "request_accepted", read: true },
        ]);
        const user = userEvent.setup();
        renderPage();

        await waitFor(() =>
            expect(
                screen.getByRole("button", {
                    name: strings.notifications.markAllRead,
                }),
            ).toBeInTheDocument(),
        );

        await user.click(
            screen.getByRole("button", {
                name: strings.notifications.markAllRead,
            }),
        );

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
        // Only the two unread ones.
        expect(batchUpdate).toHaveBeenCalledTimes(2);
    });
});
