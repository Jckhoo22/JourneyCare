import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { USER } = vi.hoisted(() => ({
    USER: {
        uid: "alex-uid",
        email: "alex@example.com",
        displayName: "Alex",
        photoURL: "",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
        reload: vi.fn(() => Promise.resolve()),
    },
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
    doc: vi.fn(),
    getDoc: vi.fn(() =>
        Promise.resolve({
            exists: () => true,
            data: () => ({ username: "Alex", email: "alex@example.com" }),
        }),
    ),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    serverTimestamp: vi.fn(),
    writeBatch: vi.fn(),
}));

import { MemoryRouter } from "react-router";

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { strings } from "../../locale/English";
import AccountMenu from "./AccountMenu";

// The menu holds a <Link> to Settings [SET1], so it needs a router around it.
const renderMenu = (onSignOut = vi.fn()) => {
    render(
        <MemoryRouter>
            <UserProvider>
                <LanguageProvider>
                    <AccountMenu onSignOut={onSignOut} />
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );
    return onSignOut;
};

/**
 * Sign-out used to be a one-tap button 8px from the notification bell, and it
 * got hit by accident. The property under test is simply: the top-level tap in
 * that corner cannot sign you out.
 */
describe("AccountMenu", () => {
    it("does NOT sign out on the first tap", async () => {
        const user = userEvent.setup();
        const onSignOut = renderMenu();

        await user.click(
            screen.getByRole("button", { name: strings.account.menuLabel }),
        );

        expect(onSignOut).not.toHaveBeenCalled();
    });

    it("keeps sign-out out of the document until the menu is open", async () => {
        const user = userEvent.setup();
        renderMenu();

        expect(
            screen.queryByRole("menuitem", { name: new RegExp(strings.home.signOut) }),
        ).toBeNull();

        await user.click(
            screen.getByRole("button", { name: strings.account.menuLabel }),
        );

        expect(
            screen.getByRole("menuitem", { name: new RegExp(strings.home.signOut) }),
        ).toBeInTheDocument();
    });

    it("signs out on the second, deliberate tap", async () => {
        const user = userEvent.setup();
        const onSignOut = renderMenu();

        await user.click(
            screen.getByRole("button", { name: strings.account.menuLabel }),
        );
        await user.click(
            screen.getByRole("menuitem", { name: new RegExp(strings.home.signOut) }),
        );

        expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it("shows who you're signed in as, so the menu answers a question too", async () => {
        const user = userEvent.setup();
        renderMenu();

        await user.click(
            screen.getByRole("button", { name: strings.account.menuLabel }),
        );

        expect(screen.getByText(strings.account.signedInAs)).toBeInTheDocument();
        expect(screen.getByText("Alex")).toBeInTheDocument();
        expect(screen.getByText("alex@example.com")).toBeInTheDocument();
    });

    it("closes on Escape without signing out", async () => {
        const user = userEvent.setup();
        const onSignOut = renderMenu();

        await user.click(
            screen.getByRole("button", { name: strings.account.menuLabel }),
        );
        await user.keyboard("{Escape}");

        expect(
            screen.queryByRole("menuitem", { name: new RegExp(strings.home.signOut) }),
        ).toBeNull();
        expect(onSignOut).not.toHaveBeenCalled();
    });

    it("closes on an outside tap without signing out", async () => {
        const user = userEvent.setup();
        const onSignOut = renderMenu();

        await user.click(
            screen.getByRole("button", { name: strings.account.menuLabel }),
        );
        await user.click(document.body);

        expect(
            screen.queryByRole("menuitem", { name: new RegExp(strings.home.signOut) }),
        ).toBeNull();
        expect(onSignOut).not.toHaveBeenCalled();
    });
});
