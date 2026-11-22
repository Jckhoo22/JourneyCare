import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { USER, batchSet, batchCommit, getDoc } = vi.hoisted(() => ({
    USER: {
        uid: "alice-uid",
        email: "alice@example.com",
        displayName: "Alice",
        photoURL: "",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
        reload: vi.fn(() => Promise.resolve()),
    },
    // The group and its public window are written in one batch, so assertions
    // read the batch's set() calls rather than an addDoc.
    batchSet: vi.fn((_ref: unknown, _data: Record<string, unknown>) => {}),
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
        id: "new-group-id",
        path: segments.join("/"),
    })),
    getDoc,
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    addDoc: vi.fn(),
    serverTimestamp: () => "SERVER_TIMESTAMP",
    increment: (by: number) => ({ __increment: by }),
    collection: vi.fn(() => "groups-collection"),
    query: vi.fn(),
    where: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    writeBatch: vi.fn(() => ({
        set: batchSet,
        update: vi.fn(),
        commit: batchCommit,
    })),
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import CreateGroup from "./CreateGroup";

const renderCreate = () =>
    render(
        <MemoryRouter initialEntries={["/groups/new"]}>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <Routes>
                            <Route path="/groups/new" element={<CreateGroup />} />
                            <Route
                                path="/groups/:groupId"
                                element={<p>group detail</p>}
                            />
                        </Routes>
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

const nameField = () =>
    screen.getByPlaceholderText(strings.groups.namePlaceholder);
const submit = () =>
    screen.getByRole("button", { name: new RegExp(strings.groups.createButton) });

describe("CreateGroup [G1]", () => {
    beforeEach(() => {
        batchSet.mockClear();
        batchCommit.mockClear();
    });

    it("refuses an empty name", async () => {
        const user = userEvent.setup();
        renderCreate();

        await user.click(submit());

        expect(screen.getByText(strings.errors.required)).toBeInTheDocument();
        expect(batchCommit).not.toHaveBeenCalled();
    });

    it("refuses a whitespace-only name", async () => {
        const user = userEvent.setup();
        renderCreate();

        await user.type(nameField(), "   ");
        await user.click(submit());

        expect(screen.getByText(strings.errors.required)).toBeInTheDocument();
        expect(batchCommit).not.toHaveBeenCalled();
    });

    it("refuses a name over 50 characters", async () => {
        const user = userEvent.setup();
        renderCreate();

        await user.type(nameField(), "x".repeat(51));
        await user.click(submit());

        expect(
            screen.getByText(strings.errors.groupNameTooLong),
        ).toBeInTheDocument();
        expect(batchCommit).not.toHaveBeenCalled();
    });

    it("seeds the creator as sole member and owner, then opens the group", async () => {
        const user = userEvent.setup();
        renderCreate();

        await user.type(nameField(), "  Family Cars  ");
        await user.click(submit());

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        // set() is called twice: the group document, then its public window.
        expect(batchSet).toHaveBeenCalledTimes(2);
        const payload = batchSet.mock.calls[0][1];
        expect(payload.name).toBe("Family Cars"); // trimmed
        expect(payload.ownerId).toBe("alice-uid");
        expect(payload.memberIds).toEqual(["alice-uid"]);
        expect(payload.canAddCars).toEqual(["alice-uid"]);
        expect(Object.keys(payload.members as object)).toEqual(["alice-uid"]);

        // The rules require 20+ characters; ours is 32 hex.
        expect(payload.joinToken).toMatch(/^[0-9a-f]{32}$/);

        await waitFor(() =>
            expect(screen.getByText("group detail")).toBeInTheDocument(),
        );
    });

    it("generates a different token per group", async () => {
        const user = userEvent.setup();

        renderCreate();
        await user.type(nameField(), "One");
        await user.click(submit());
        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        renderCreate();
        await user.type(nameField(), "Two");
        await user.click(submit());
        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(2));

        // calls 0 and 2 are the group documents; 1 and 3 the public windows.
        const first = batchSet.mock.calls[0][1].joinToken;
        const second = batchSet.mock.calls[2][1].joinToken;
        expect(first).not.toBe(second);
    });
});
