import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROUP_ID = "family-car";
const TOKEN = "0123456789abcdef0123456789abcdef";

const { USER, getDoc, getDocs, batchSet, batchCommit } = vi.hoisted(() => ({
    USER: {
        uid: "joiner-uid",
        email: "joiner@example.com",
        displayName: "Joiner",
        photoURL: "",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
        reload: vi.fn(() => Promise.resolve()),
    },
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    // The join request and the owner's notification go in one batch. [N1]
    batchSet: vi.fn((_ref: unknown, _data: Record<string, unknown>) => {}),
    batchCommit: vi.fn(() => Promise.resolve()),
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

// `doc()` records the path so the getDoc stub can answer per-document. The old
// version of this test stubbed getDoc to blanket-succeed, which is exactly how
// it missed that a non-member is forbidden to read groups/{id}.
vi.mock("firebase/firestore", () => ({
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
        path: segments.join("/"),
    })),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    getDoc,
    getDocs,
    addDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    limit: vi.fn(),
    orderBy: vi.fn(),
    serverTimestamp: () => "SERVER_TIMESTAMP",
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
import JoinGroup from "./JoinGroup";

class PermissionDenied extends Error {
    code = "permission-denied";
}

interface Scenario {
    /** null = the read is denied, as it is for any non-member. */
    group: Record<string, unknown> | null;
    publicInfo: Record<string, unknown> | null;
}

/**
 * Answers reads by path, the way Firestore actually would for a non-member:
 * `groups/{id}` denied, `groups/{id}/public/info` allowed.
 */
const mockReads = ({ group, publicInfo }: Scenario) => {
    getDoc.mockImplementation((ref: { path?: string }) => {
        const path = ref?.path ?? "";

        if (path.startsWith("users/")) {
            return Promise.resolve({
                exists: () => true,
                data: () => ({ username: "Joiner", email: "joiner@example.com" }),
            });
        }

        if (path.endsWith("/public/info")) {
            return Promise.resolve({
                exists: () => publicInfo !== null,
                data: () => publicInfo,
            });
        }

        // groups/{id}
        if (group === null) return Promise.reject(new PermissionDenied());
        return Promise.resolve({
            id: GROUP_ID,
            exists: () => true,
            data: () => group,
        });
    });
};

const renderJoin = (path = `/join/${GROUP_ID}/${TOKEN}`) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <Routes>
                            <Route
                                path="/join/:groupId/:token"
                                element={<JoinGroup />}
                            />
                        </Routes>
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

describe("JoinGroup [G5]", () => {
    beforeEach(() => {
        getDoc.mockReset();
        getDocs.mockReset();
        batchSet.mockClear();
        batchCommit.mockClear();
        getDocs.mockResolvedValue({ empty: true, docs: [] });
    });

    // The regression. A real joiner is denied groups/{id}; the screen must
    // still work, using the public window for the name.
    it("works for a NON-MEMBER, who cannot read the group document", async () => {
        mockReads({ group: null, publicInfo: { name: "Family Cars", ownerId: "owner-uid" } });
        const user = userEvent.setup();
        renderJoin();

        await waitFor(() =>
            expect(screen.getByText("Family Cars")).toBeInTheDocument(),
        );

        await user.click(
            screen.getByRole("button", {
                name: new RegExp(strings.join.requestButton),
            }),
        );

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        // The request itself...
        expect(batchSet.mock.calls[0][1]).toMatchObject({
            groupId: GROUP_ID,
            token: TOKEN,
            uid: "joiner-uid",
            status: "pending",
        });
        // ...and the owner's notification, in the same batch. [N1]
        expect(batchSet).toHaveBeenCalledTimes(2);
        expect(batchSet.mock.calls[1][1]).toMatchObject({
            type: "join_request",
            read: false,
            payload: { groupId: GROUP_ID, groupName: "Family Cars" },
        });
    });

    /**
     * The notifications regression. [Item 2, N1]
     *
     * `groups/{id}/public/info.ownerId` is the ONLY thing that tells a
     * non-member who to address their join notification to. When it's absent
     * the old code skipped the notification with a bare `if (ownerId)` and
     * committed the request anyway — so the joiner saw "Request sent", the
     * owner was told nothing, and there was no trace of it anywhere.
     *
     * The request must still go through (a joinable group the owner has to
     * find manually beats no request at all), but it must never be silent.
     */
    it("shouts rather than silently dropping the owner notification", async () => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        // A public window written before ownerId was part of its shape.
        mockReads({ group: null, publicInfo: { name: "Family Cars" } });
        const user = userEvent.setup();
        renderJoin();

        await waitFor(() =>
            expect(screen.getByText("Family Cars")).toBeInTheDocument(),
        );
        await user.click(
            screen.getByRole("button", {
                name: new RegExp(strings.join.requestButton),
            }),
        );

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

        // The request survives...
        expect(batchSet).toHaveBeenCalledTimes(1);
        expect(batchSet.mock.calls[0][1]).toMatchObject({
            groupId: GROUP_ID,
            uid: "joiner-uid",
            status: "pending",
        });
        // ...and the missing notification is on the record.
        expect(logged).toHaveBeenCalledWith(
            expect.stringContaining("no owner notification"),
        );

        logged.mockRestore();
    });

    it("never claims an invite expired", async () => {
        mockReads({ group: null, publicInfo: null });
        renderJoin();

        await waitFor(() =>
            expect(
                screen.getByText(strings.join.groupMissingTitle),
            ).toBeInTheDocument(),
        );
        expect(document.body.textContent).not.toMatch(/expir/i);
        expect(document.body.textContent).not.toMatch(/out of date/i);
    });

    it("says the group is gone when there is no public info", async () => {
        mockReads({ group: null, publicInfo: null });
        renderJoin();

        await waitFor(() =>
            expect(
                screen.getByText(strings.join.groupMissingTitle),
            ).toBeInTheDocument(),
        );
    });

    it("calls a truncated link incomplete, not invalid or expired", async () => {
        mockReads({ group: null, publicInfo: { name: "Family Cars", ownerId: "owner-uid" } });
        renderJoin(`/join/${GROUP_ID}/tooshort`);

        await waitFor(() =>
            expect(
                screen.getByText(strings.join.invalidLinkTitle),
            ).toBeInTheDocument(),
        );
        expect(batchCommit).not.toHaveBeenCalled();
    });

    it("reports a refused token honestly when the rules reject it", async () => {
        mockReads({ group: null, publicInfo: { name: "Family Cars", ownerId: "owner-uid" } });
        batchCommit.mockRejectedValueOnce(new PermissionDenied());
        const user = userEvent.setup();
        renderJoin();

        await waitFor(() =>
            expect(screen.getByText("Family Cars")).toBeInTheDocument(),
        );
        await user.click(
            screen.getByRole("button", {
                name: new RegExp(strings.join.requestButton),
            }),
        );

        await waitFor(() =>
            expect(
                screen.getByText(strings.join.rejectedTitle),
            ).toBeInTheDocument(),
        );
        expect(document.body.textContent).not.toMatch(/expir(ed|es)/i);
    });

    it("recognises an existing member by their ability to read the group", async () => {
        mockReads({
            group: {
                name: "Family Cars",
                ownerId: "owner-uid",
                memberIds: ["owner-uid", "joiner-uid"],
                members: {},
                joinToken: TOKEN,
            },
            publicInfo: { name: "Family Cars", ownerId: "owner-uid" },
        });
        renderJoin();

        await waitFor(() =>
            expect(
                screen.getByText(strings.join.alreadyMemberTitle),
            ).toBeInTheDocument(),
        );
        expect(
            screen.getByRole("link", { name: new RegExp(strings.join.openGroup) }),
        ).toHaveAttribute("href", `/groups/${GROUP_ID}`);
    });

    it("tells a repeat visitor their request is already pending", async () => {
        mockReads({ group: null, publicInfo: { name: "Family Cars", ownerId: "owner-uid" } });
        getDocs.mockResolvedValue({ empty: false, docs: [{ id: "req-1" }] });
        renderJoin();

        await waitFor(() =>
            expect(
                screen.getByText(strings.join.alreadyPendingTitle),
            ).toBeInTheDocument(),
        );
        expect(
            screen.queryByRole("button", {
                name: new RegExp(strings.join.requestButton),
            }),
        ).toBeNull();
    });
});
