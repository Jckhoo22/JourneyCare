import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { USER, onSnapshot, getDoc } = vi.hoisted(() => ({
    USER: {
        uid: "alice-uid",
        email: "alice@example.com",
        displayName: "Alex",
        photoURL: "",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
        reload: vi.fn(() => Promise.resolve()),
    },
    onSnapshot: vi.fn(),
    getDoc: vi.fn(() =>
        Promise.resolve({
            exists: () => true,
            data: () => ({ username: "Alex", email: "alice@example.com" }),
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
    doc: vi.fn(),
    getDoc,
    // Must resolve: useSyncGroupsOwned chains .catch onto it. [P3b]
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    increment: vi.fn((by: number) => ({ __increment: by })),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot,
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import HomePage from "./HomePage";

/** Drives the mocked listener with a fixed set of group documents. */
const emitGroups = (
    docs: Array<{ id: string; data: Record<string, unknown> }>,
) => {
    onSnapshot.mockImplementation(
        (_query: unknown, next: (snap: unknown) => void) => {
            next({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
            return () => {};
        },
    );
};

const renderHome = () =>
    render(
        <MemoryRouter>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <HomePage />
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

describe("HomePage", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
    });

    it("shows the top bar with a live bell linking to notifications [H1, N2]", async () => {
        emitGroups([]);
        renderHome();

        expect(screen.getByText(strings.appName)).toBeInTheDocument();

        // Wired in T7 — no longer the disabled placeholder.
        expect(
            screen.getByRole("link", { name: strings.notifications.bellLabel }),
        ).toHaveAttribute("href", "/notifications");

        // Sign-out is behind the account menu now, not a bare button in the
        // corner — see AccountMenu.test.tsx.
        expect(
            screen.getByRole("button", { name: strings.account.menuLabel }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: strings.home.signOut }),
        ).toBeNull();
    });

    it("shows the empty state with both actions when there are no groups [H5]", async () => {
        emitGroups([]);
        renderHome();

        await waitFor(() =>
            expect(screen.getByText(strings.home.emptyTitle)).toBeInTheDocument(),
        );
        expect(screen.getByText(strings.home.emptyBody)).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: new RegExp(strings.home.createGroup) }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: new RegExp(strings.home.joinGroup) }),
        ).toBeInTheDocument();
    });

    it("lists groups with name, member count and a link to detail [H2, H4]", async () => {
        emitGroups([
            {
                id: "family-car",
                data: { name: "Family Car", memberIds: ["alice-uid", "bob-uid"] },
            },
            { id: "solo", data: { name: "Solo", memberIds: ["alice-uid"] } },
        ]);
        renderHome();

        await waitFor(() =>
            expect(screen.getByText("Family Car")).toBeInTheDocument(),
        );

        expect(screen.getByText("2 members")).toBeInTheDocument();
        // Singular, not "1 members".
        expect(screen.getByText("1 member")).toBeInTheDocument();

        // Two links point at each group now: the card, and that group's row in
        // the summary strip [S2]. Both are correct, so assert every one of
        // them lands in the right place rather than picking one.
        screen
            .getAllByRole("link", { name: /Family Car/ })
            .forEach((link) =>
                expect(link).toHaveAttribute("href", "/groups/family-car"),
            );

        // Populated list means no empty state.
        expect(screen.queryByText(strings.home.emptyTitle)).toBeNull();
    });

    /**
     * The two sections. [Item 5]
     *
     * Membership decides which list a group lands in, and the split is derived
     * from the same live snapshot as the list itself — so an accepted request
     * or a deleted group moves between sections without a second source of
     * truth to keep in step.
     */
    it("splits owned groups from joined ones", async () => {
        emitGroups([
            {
                id: "mine",
                data: {
                    name: "My Cars",
                    ownerId: "alice-uid",
                    memberIds: ["alice-uid"],
                },
            },
            {
                id: "theirs",
                data: {
                    name: "Their Cars",
                    ownerId: "bob-uid",
                    memberIds: ["alice-uid", "bob-uid"],
                },
            },
        ]);
        renderHome();

        await waitFor(() =>
            expect(screen.getByText("My Cars")).toBeInTheDocument(),
        );

        expect(screen.getByText(strings.home.ownedTitle)).toBeInTheDocument();
        expect(screen.getByText(strings.home.joinedTitle)).toBeInTheDocument();

        // The badge marks the owned one, and only the owned one.
        expect(screen.getAllByText(strings.home.ownerBadge)).toHaveLength(1);
    });

    it("shows only the section that has groups in it [Item 5]", async () => {
        emitGroups([
            {
                id: "theirs",
                data: {
                    name: "Their Cars",
                    ownerId: "bob-uid",
                    memberIds: ["alice-uid", "bob-uid"],
                },
            },
        ]);
        renderHome();

        await waitFor(() =>
            expect(screen.getByText(strings.home.joinedTitle)).toBeInTheDocument(),
        );
        // No empty "Your groups" heading hanging over nothing.
        expect(screen.queryByText(strings.home.ownedTitle)).toBeNull();
        expect(screen.queryByText(strings.home.emptyTitle)).toBeNull();
    });

    it("survives a group document missing fields", async () => {
        // Hand-authored console docs may lack keys; the list must still render.
        emitGroups([{ id: "sparse", data: { memberIds: ["alice-uid"] } }]);
        renderHome();

        await waitFor(() =>
            expect(screen.getByText("Untitled group")).toBeInTheDocument(),
        );
    });

    it("surfaces a listener error instead of a bare empty state", async () => {
        onSnapshot.mockImplementation(
            (
                _query: unknown,
                _next: unknown,
                onError: (error: unknown) => void,
            ) => {
                onError({ code: "permission-denied" });
                return () => {};
            },
        );
        renderHome();

        await waitFor(() =>
            expect(
                screen.getByText("You don't have permission to do that."),
            ).toBeInTheDocument(),
        );
        expect(screen.queryByText(strings.home.emptyTitle)).toBeNull();
    });
});
