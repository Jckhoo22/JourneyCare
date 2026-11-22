import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above the module body, so anything they close
// over has to be hoisted with them.
const { GOOGLE_USER, getDoc, setDoc, updateDoc } = vi.hoisted(() => ({
    GOOGLE_USER: {
        uid: "google-uid",
        email: "driver@example.com",
        displayName: "Jie Cheng",
        photoURL: "",
        emailVerified: true,
        providerData: [{ providerId: "google.com" }],
        reload: vi.fn(() => Promise.resolve()),
    },
    // No profile doc yet — this is a first-entry user.
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../configurations/firebase-config", () => ({
    auth: { currentUser: GOOGLE_USER },
    db: {},
    googleAuthProvider: {},
}));

vi.mock("firebase/auth", () => ({
    onAuthStateChanged: (
        _auth: unknown,
        callback: (user: typeof GOOGLE_USER) => void,
    ) => {
        callback(GOOGLE_USER);
        return () => {};
    },
    getRedirectResult: () => Promise.resolve(null),
    updateProfile: vi.fn(() => Promise.resolve()),
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
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp: () => "SERVER_TIMESTAMP",
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import ChooseUsername from "./ChooseUsername";

const renderScreen = () =>
    render(
        <UserProvider>
            <LanguageProvider>
                <ToastProvider>
                    <ChooseUsername />
                </ToastProvider>
            </LanguageProvider>
        </UserProvider>,
    );

const field = () => screen.getByPlaceholderText(strings.fields.usernamePlaceholder);
const submit = () =>
    screen.getByRole("button", { name: new RegExp(strings.username.submitButton) });

describe("ChooseUsername [A6]", () => {
    beforeEach(() => {
        setDoc.mockClear();
        updateDoc.mockClear();
    });

    it("prefills a social display name, but still requires confirmation", async () => {
        renderScreen();

        await waitFor(() => expect(field()).toHaveValue("Jie Cheng"));
        // Nothing is written until the user presses Continue.
        expect(setDoc).not.toHaveBeenCalled();
    });

    it("rejects a name that is too short", async () => {
        const user = userEvent.setup();
        renderScreen();
        await waitFor(() => expect(field()).toHaveValue("Jie Cheng"));

        await user.clear(field());
        await user.type(field(), "Jo");
        await user.click(submit());

        expect(screen.getByText(strings.errors.invalidUsername)).toBeInTheDocument();
        expect(setDoc).not.toHaveBeenCalled();
    });

    it("rejects an empty name", async () => {
        const user = userEvent.setup();
        renderScreen();
        await waitFor(() => expect(field()).toHaveValue("Jie Cheng"));

        await user.clear(field());
        await user.click(submit());

        expect(screen.getByText(strings.errors.required)).toBeInTheDocument();
        expect(setDoc).not.toHaveBeenCalled();
    });

    it("rejects whitespace padded out to look long enough", async () => {
        const user = userEvent.setup();
        renderScreen();
        await waitFor(() => expect(field()).toHaveValue("Jie Cheng"));

        await user.clear(field());
        await user.type(field(), "  a  ");
        await user.click(submit());

        expect(screen.getByText(strings.errors.invalidUsername)).toBeInTheDocument();
        expect(setDoc).not.toHaveBeenCalled();
    });

    it("creates users/{uid} with the confirmed name", async () => {
        const user = userEvent.setup();
        renderScreen();
        await waitFor(() => expect(field()).toHaveValue("Jie Cheng"));

        await user.clear(field());
        await user.type(field(), "  Jie  ");
        await user.click(submit());

        await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
        expect(setDoc).toHaveBeenCalledWith(
            expect.objectContaining({ collection: "users", id: "google-uid" }),
            {
                username: "Jie", // trimmed
                email: "driver@example.com",
                createdAt: "SERVER_TIMESTAMP",
            },
        );
    });

    it("accepts a non-Latin name", async () => {
        const user = userEvent.setup();
        renderScreen();
        await waitFor(() => expect(field()).toHaveValue("Jie Cheng"));

        await user.clear(field());
        await user.type(field(), "邱杰誠");
        await user.click(submit());

        await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
        expect(setDoc).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ username: "邱杰誠" }),
        );
    });
});
