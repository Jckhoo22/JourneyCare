import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { USER, onSnapshot, limitSpy, getDoc } = vi.hoisted(() => ({
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
    limitSpy: vi.fn((n: number) => ({ __limit: n })),
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
}));

vi.mock("firebase/firestore", () => ({
    doc: vi.fn(),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: limitSpy,
    getDoc,
    writeBatch: vi.fn(),
    onSnapshot,
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { strings } from "../../locale/English";
import TopBar from "./TopBar";

/** Emits `count` unread notification documents to the badge listener. */
const emitUnread = (count: number) => {
    onSnapshot.mockImplementation(
        (_query: unknown, next: (snap: unknown) => void) => {
            next({
                docs: Array.from({ length: count }, (_, at) => ({
                    id: `n${at}`,
                    data: () => ({
                        type: "join_request",
                        read: false,
                        payload: { groupId: "g", groupName: "Family Cars" },
                        createdAt: null,
                    }),
                })),
            });
            return () => {};
        },
    );
};

const renderBar = () =>
    render(
        <MemoryRouter>
            <UserProvider>
                <LanguageProvider>
                    <TopBar onSignOut={() => {}} />
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

describe("TopBar — the unread badge [N2]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        limitSpy.mockClear();
    });

    it("shows no badge at all when nothing is unread", async () => {
        emitUnread(0);
        renderBar();

        await waitFor(() =>
            expect(
                screen.getByRole("link", {
                    name: strings.notifications.bellLabel,
                }),
            ).toBeInTheDocument(),
        );
        // A zero badge is a dot that means "nothing" — worse than no dot.
        expect(screen.queryByText("0")).toBeNull();
    });

    it("shows an exact count, and says it in the bell's label too", async () => {
        emitUnread(3);
        renderBar();

        await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
        expect(
            screen.getByRole("link", {
                name: strings.notifications.bellWithCount.replace("{count}", "3"),
            }),
        ).toHaveAttribute("href", "/notifications");
    });

    it("is exact at 99", async () => {
        emitUnread(99);
        renderBar();

        await waitFor(() => expect(screen.getByText("99")).toBeInTheDocument());
    });

    /**
     * The cap is two things working together: the badge only needs to
     * distinguish counts up to 99, so the LISTENER stops at 100 rather than
     * reading a user's whole history, and the formatter renders anything past
     * 99 as "99+". Both are asserted here — a future change that raised the
     * listener bound without the formatter would show "100" in a 2ch badge.
     */
    it("caps the display at 99+ and the listener at 100 documents", async () => {
        emitUnread(100);
        renderBar();

        await waitFor(() => expect(screen.getByText("99+")).toBeInTheDocument());
        expect(limitSpy).toHaveBeenCalledWith(100);
    });
});
