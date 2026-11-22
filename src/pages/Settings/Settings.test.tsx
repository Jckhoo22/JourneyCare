import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Settings, and the rename it exists for. [SET1, SET2, D2]
 *
 * The bug this screen fixes was not a validation bug or a rules bug — there
 * was simply no second writer of `users/{uid}.username` anywhere in the app,
 * so the name chosen on the first-run screen was permanent. The assertions
 * that matter here are therefore about the WRITE: that it happens at all, and
 * that it reaches the denormalised copy on every group as well as the profile.
 */

const { USER, getDoc, getDocs, setDoc, updateDoc, updateProfile, batchUpdate, commit } =
    vi.hoisted(() => ({
        USER: {
            uid: "driver-uid",
            email: "driver@example.com",
            displayName: "Jie",
            photoURL: "",
            emailVerified: true,
            providerData: [{ providerId: "password" }],
            reload: vi.fn(() => Promise.resolve()),
        },
        getDoc: vi.fn(() =>
            Promise.resolve({
                exists: () => true,
                data: () => ({ username: "Jie", email: "driver@example.com" }),
            }),
        ),
        // Two groups hold a copy of this user's name.
        getDocs: vi.fn(() =>
            Promise.resolve({
                docs: [
                    { ref: { id: "group-a" } },
                    { ref: { id: "group-b" } },
                ],
            }),
        ),
        setDoc: vi.fn(() => Promise.resolve()),
        updateDoc: vi.fn(() => Promise.resolve()),
        updateProfile: vi.fn(() => Promise.resolve()),
        batchUpdate: vi.fn(),
        commit: vi.fn(() => Promise.resolve()),
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
    updateProfile,
    signOut: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn(),
    sendEmailVerification: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
    doc: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
    collection: vi.fn((_db: unknown, name: string) => ({ name })),
    query: vi.fn((...args: unknown[]) => args),
    where: vi.fn((...args: unknown[]) => args),
    // TopBar's unread-count listener rides along on this screen. [N2]
    limit: vi.fn(),
    orderBy: vi.fn(),
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    writeBatch: () => ({ update: batchUpdate, commit }),
    serverTimestamp: () => "SERVER_TIMESTAMP",
    onSnapshot: vi.fn(() => () => {}),
}));

import { MemoryRouter } from "react-router";

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import Settings from "./Settings";

const renderScreen = () =>
    render(
        <MemoryRouter>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <Settings />
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

const field = () => screen.getByPlaceholderText(strings.settings.namePlaceholder);

/**
 * The Settings display name auto-saves on blur — there's no Save button.
 * Testing the write path is now a "type, tab away, expect the write"
 * sequence. `user.tab()` blurs the field cleanly the way a real user
 * moving on would.
 */

beforeEach(() => {
    vi.clearAllMocks();
});

describe("Settings [SET2] — display name auto-save on blur", () => {
    it("shows the current name and the sign-in email", async () => {
        renderScreen();

        await waitFor(() => expect(field()).toHaveValue("Jie"));
        expect(screen.getByText("driver@example.com")).toBeInTheDocument();
    });

    it("does not write when the field is blurred without changes", async () => {
        // An untouched blur (user taps the field and taps away without
        // typing) must NOT fire a save — the auto-save contract is
        // "only if changed and non-empty".
        const user = userEvent.setup();
        renderScreen();

        await waitFor(() => expect(field()).toHaveValue("Jie"));
        field().focus();
        await user.tab();

        expect(updateDoc).not.toHaveBeenCalled();
        expect(commit).not.toHaveBeenCalled();
    });

    it("writes the new name on blur", async () => {
        const user = userEvent.setup();
        renderScreen();

        await waitFor(() => expect(field()).toHaveValue("Jie"));
        await user.clear(field());
        await user.type(field(), "Jie Cheng");
        // Blur triggers auto-save.
        await user.tab();

        await waitFor(() =>
            expect(updateDoc).toHaveBeenCalledWith(
                expect.objectContaining({ collection: "users", id: "driver-uid" }),
                expect.objectContaining({ username: "Jie Cheng" }),
            ),
        );
    });

    it("fans the new name out to every group that holds a copy", async () => {
        const user = userEvent.setup();
        renderScreen();

        await waitFor(() => expect(field()).toHaveValue("Jie"));
        await user.clear(field());
        await user.type(field(), "Jie Cheng");
        await user.tab();

        await waitFor(() => expect(commit).toHaveBeenCalled());

        expect(batchUpdate).toHaveBeenCalledTimes(2);
        expect(batchUpdate).toHaveBeenCalledWith(
            { id: "group-a" },
            { "members.driver-uid.username": "Jie Cheng" },
        );
        expect(batchUpdate).toHaveBeenCalledWith(
            { id: "group-b" },
            { "members.driver-uid.username": "Jie Cheng" },
        );
    });

    it("keeps the auth display name in step", async () => {
        const user = userEvent.setup();
        renderScreen();

        await waitFor(() => expect(field()).toHaveValue("Jie"));
        await user.clear(field());
        await user.type(field(), "Jie Cheng");
        await user.tab();

        await waitFor(() =>
            expect(updateProfile).toHaveBeenCalledWith(USER, {
                displayName: "Jie Cheng",
            }),
        );
    });

    it("refuses a too-short name on blur and writes nothing", async () => {
        const user = userEvent.setup();
        renderScreen();

        await waitFor(() => expect(field()).toHaveValue("Jie"));
        await user.clear(field());
        await user.type(field(), "Ji");
        await user.tab();

        expect(
            await screen.findByText(strings.errors.invalidUsername),
        ).toBeInTheDocument();
        expect(updateDoc).not.toHaveBeenCalled();
        expect(commit).not.toHaveBeenCalled();
    });

    it("silently reverts an empty blur — never writes an empty username", async () => {
        // A trimmed-empty blur is treated as "the user changed their mind",
        // not as "please write empty". The rules would refuse an empty
        // write, but a rules-denied error is a poor teacher — the field
        // just snaps back to the current name.
        const user = userEvent.setup();
        renderScreen();

        await waitFor(() => expect(field()).toHaveValue("Jie"));
        await user.clear(field());
        await user.tab();

        expect(updateDoc).not.toHaveBeenCalled();
        expect(commit).not.toHaveBeenCalled();
        // Field reverted to the profile value.
        expect(field()).toHaveValue("Jie");
    });

    it("caps the field at the length the rules enforce", async () => {
        renderScreen();

        await waitFor(() => expect(field()).toHaveValue("Jie"));
        expect(field()).toHaveAttribute("maxlength", "20");
    });
});
