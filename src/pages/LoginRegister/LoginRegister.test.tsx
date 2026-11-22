import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Firebase is stubbed out: these tests cover the form's validation rules, which
// must reject bad input before any network call happens.
vi.mock("../../configurations/firebase-config", () => ({
    auth: { currentUser: null },
    db: {},
    googleAuthProvider: {},
}));

vi.mock("firebase/auth", () => ({
    onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => {
        callback(null);
        return () => {};
    },
    getRedirectResult: () => Promise.resolve(null),
    createUserWithEmailAndPassword: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn(),
    sendEmailVerification: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
    doc: vi.fn(),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(),
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import LoginRegister from "./LoginRegister";

const renderAuthScreen = () =>
    render(
        <UserProvider>
            <LanguageProvider>
                <ToastProvider>
                    <LoginRegister />
                </ToastProvider>
            </LanguageProvider>
        </UserProvider>,
    );

const openSignUp = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: strings.register.tabTitle }));
};

describe("LoginRegister validation", () => {
    it("never asks for a username — that lives on its own screen [A6]", async () => {
        const user = userEvent.setup();
        renderAuthScreen();

        expect(screen.queryByText(strings.fields.usernameLabel)).toBeNull();

        await openSignUp(user);

        expect(screen.queryByText(strings.fields.usernameLabel)).toBeNull();
        expect(
            screen.queryByPlaceholderText(strings.fields.usernamePlaceholder),
        ).toBeNull();
    });

    it("shows the confirm-password field only on Sign Up", async () => {
        const user = userEvent.setup();
        renderAuthScreen();

        expect(
            screen.queryByText(strings.fields.confirmPasswordLabel),
        ).toBeNull();

        await openSignUp(user);

        expect(
            screen.getByText(strings.fields.confirmPasswordLabel),
        ).toBeInTheDocument();
    });

    it("flags every empty field on an empty Sign Up submit", async () => {
        const user = userEvent.setup();
        renderAuthScreen();
        await openSignUp(user);

        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.register.submitButton) }),
        );

        // email, password, confirm password — and no username row
        expect(screen.getAllByText(strings.errors.required)).toHaveLength(3);
    });

    it("rejects a password that doesn't meet the strength rule", async () => {
        const user = userEvent.setup();
        renderAuthScreen();
        await openSignUp(user);

        await user.type(screen.getByPlaceholderText(strings.fields.emailPlaceholder), "driver@example.com");
        await user.type(screen.getByPlaceholderText(strings.fields.createPasswordPlaceholder), "short");
        await user.type(screen.getByPlaceholderText(strings.fields.confirmPasswordPlaceholder), "short");

        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.register.submitButton) }),
        );

        expect(screen.getByText(strings.errors.weakPassword)).toBeInTheDocument();
    });

    it("rejects mismatched passwords", async () => {
        const user = userEvent.setup();
        renderAuthScreen();
        await openSignUp(user);

        await user.type(screen.getByPlaceholderText(strings.fields.emailPlaceholder), "driver@example.com");
        await user.type(screen.getByPlaceholderText(strings.fields.createPasswordPlaceholder), "password1");
        await user.type(screen.getByPlaceholderText(strings.fields.confirmPasswordPlaceholder), "password2");

        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.register.submitButton) }),
        );

        expect(screen.getByText(strings.errors.passwordMismatch)).toBeInTheDocument();
    });

    it("rejects a malformed email on Login", async () => {
        const user = userEvent.setup();
        renderAuthScreen();

        await user.type(screen.getByPlaceholderText(strings.fields.emailPlaceholder), "not-an-email");
        await user.type(screen.getByPlaceholderText(strings.fields.passwordPlaceholder), "password1");

        await user.click(
            screen.getByRole("button", { name: new RegExp(strings.login.submitButton) }),
        );

        expect(screen.getByText(strings.errors.invalidEmail)).toBeInTheDocument();
    });
});
