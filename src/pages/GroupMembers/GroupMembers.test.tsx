import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { USER, onSnapshot, batchDelete, batchCommit, getDoc, getDocs } =
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
    // Deleting a group batches the group doc and its public window together.
    batchDelete: vi.fn((_ref: unknown) => {}),
    batchCommit: vi.fn(() => Promise.resolve()),
    getDoc: vi.fn(() =>
        Promise.resolve({
            exists: () => true,
            data: () => ({ username: "Alice", email: "alice@example.com" }),
        }),
    ),
    // The delete cascade reads the group's cars, then each car's logs. [T16]
    getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
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

// `doc` and `query` return tagged objects so the shared onSnapshot mock can
// tell the single-group listener from the pending-requests one.
vi.mock("firebase/firestore", () => ({
    doc: vi.fn(() => ({ kind: "doc" })),
    getDoc,
    getDocs,
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    addDoc: vi.fn(),
    deleteDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    increment: vi.fn((by: number) => ({ __increment: by })),
    collection: vi.fn(() => ({ kind: "collection" })),
    query: vi.fn(() => ({ kind: "query" })),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot,
    writeBatch: vi.fn(() => ({
        set: vi.fn(),
        update: vi.fn(),
        delete: batchDelete,
        commit: batchCommit,
    })),
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import GroupMembers from "./GroupMembers";

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

/**
 * Drives both listeners: the group document, and the owner's pending-request
 * query (empty unless `pending` is supplied).
 */
const emitGroup = (
    data: Record<string, unknown> | null,
    pending: Array<{ id: string; data: Record<string, unknown> }> = [],
) => {
    onSnapshot.mockImplementation(
        (ref: { kind?: string }, next: (snap: unknown) => void) => {
            if (ref?.kind === "query") {
                next({ docs: pending.map((p) => ({ id: p.id, data: () => p.data })) });
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

const renderMembers = () =>
    render(
        <MemoryRouter initialEntries={["/groups/family-car/members"]}>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <Routes>
                            <Route
                                path="/groups/:groupId/members"
                                element={<GroupMembers />}
                            />
                            <Route path="/" element={<p>home screen</p>} />
                        </Routes>
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

/**
 * The member list, pending requests and the delete / leave controls moved here
 * from the group screen in Item 4. The behaviour below is unchanged — only the
 * route it lives on is new.
 */
describe("GroupMembers [G9, G10, G11, Item 4]", () => {
    beforeEach(() => {
        onSnapshot.mockReset();
        batchDelete.mockClear();
        batchCommit.mockClear();
        // Reset rather than clear: the cascade test queues per-call results,
        // and a leftover queue would leak into the next test. [T16]
        getDocs.mockReset();
        getDocs.mockResolvedValue({ docs: [] } as never);
    });

    it("shows members, owner first and badged", async () => {
        emitGroup(OWNED_GROUP);
        renderMembers();

        await waitFor(() =>
            expect(screen.getByText("Alice")).toBeInTheDocument(),
        );

        const names = screen
            .getAllByText(/^(Alice|Bob)$/)
            .map((node) => node.textContent);
        expect(names).toEqual(["Alice", "Bob"]);

        expect(screen.getByText(strings.members.ownerBadge)).toBeInTheDocument();
    });

    it("shows a neutral not-found state when the group is absent or denied", async () => {
        emitGroup(null);
        renderMembers();

        await waitFor(() =>
            expect(
                screen.getByText(strings.groups.notFoundTitle),
            ).toBeInTheDocument(),
        );
    });

    it("hides the delete control from a non-owner, offering Leave instead", async () => {
        emitGroup({ ...OWNED_GROUP, ownerId: "bob-uid" });
        renderMembers();

        await waitFor(() =>
            expect(screen.getByText("Alice")).toBeInTheDocument(),
        );

        expect(
            screen.queryByRole("button", { name: strings.groups.deleteButton }),
        ).toBeNull();
        expect(screen.queryByText(strings.groups.deleteTitle)).toBeNull();
        expect(
            screen.getByRole("button", { name: strings.members.leaveButton }),
        ).toBeInTheDocument();
    });

    it("never deletes on the first click — it asks first [G11]", async () => {
        const user = userEvent.setup();
        emitGroup(OWNED_GROUP);
        renderMembers();

        await waitFor(() =>
            expect(screen.getByText("Alice")).toBeInTheDocument(),
        );

        await user.click(
            screen.getByRole("button", { name: strings.groups.deleteButton }),
        );

        expect(batchCommit).not.toHaveBeenCalled();
        // The prompt names the group and its whole consequence (all cars,
        // every log, for everyone) rather than a generic "delete?" — the
        // confirm-tap must not be a shortcut past reading it.
        const expectedPrompt = strings.groups.deleteConfirmPrompt.replace(
            "{name}",
            OWNED_GROUP.name,
        );
        expect(screen.getByText(expectedPrompt)).toBeInTheDocument();
    });

    it("deletes once confirmed, then returns home", async () => {
        const user = userEvent.setup();
        emitGroup(OWNED_GROUP);
        renderMembers();

        await waitFor(() =>
            expect(screen.getByText("Alice")).toBeInTheDocument(),
        );

        await user.click(
            screen.getByRole("button", { name: strings.groups.deleteButton }),
        );
        await user.click(
            screen.getByRole("button", { name: strings.groups.deleteConfirmButton }),
        );

        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
        // The group and its public invite window go together, so a stale link
        // can't survive the group. [T8]
        expect(batchDelete).toHaveBeenCalledTimes(2);
        await waitFor(() =>
            expect(screen.getByText("home screen")).toBeInTheDocument(),
        );
    });

    /**
     * The cascade BUGS.md predicted. [T16, G11, C8]
     *
     * Firestore never deletes subcollections with their parent, and an
     * orphaned car is not merely untidy: it can hold a 250,000-character
     * photo, and once its group is gone the rules make it unreadable and
     * undeletable by anyone forever. On a zero-cost project that is a
     * permanent charge against the free tier nobody can reclaim.
     */
    it("takes the group's cars and their logs down with it", async () => {
        const carRefs = [{ ref: { kind: "car-1" }, id: "myvi" }];
        const logRefs = [
            { ref: { kind: "log-1" }, id: "l1" },
            { ref: { kind: "log-2" }, id: "l2" },
        ];
        // First call is the cars query, then one logs read per car.
        getDocs
            .mockResolvedValueOnce({ docs: carRefs } as never)
            .mockResolvedValueOnce({ docs: logRefs } as never);

        const user = userEvent.setup();
        emitGroup(OWNED_GROUP);
        renderMembers();

        await waitFor(() =>
            expect(screen.getByText("Alice")).toBeInTheDocument(),
        );

        await user.click(
            screen.getByRole("button", { name: strings.groups.deleteButton }),
        );
        await user.click(
            screen.getByRole("button", { name: strings.groups.deleteConfirmButton }),
        );

        // Three commits, deepest first: logs, then cars, then the group with
        // its public window. The order is load-bearing — every child's delete
        // rule calls groupExists(), so the group has to outlive them.
        await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(3));
        // 2 logs + 1 car + the group + its public info.
        expect(batchDelete).toHaveBeenCalledTimes(5);
        expect(batchDelete).toHaveBeenCalledWith({ kind: "log-1" });
        expect(batchDelete).toHaveBeenCalledWith({ kind: "car-1" });
    });

    it("lets the user back out of the confirmation", async () => {
        const user = userEvent.setup();
        emitGroup(OWNED_GROUP);
        renderMembers();

        await waitFor(() =>
            expect(screen.getByText("Alice")).toBeInTheDocument(),
        );

        await user.click(
            screen.getByRole("button", { name: strings.groups.deleteButton }),
        );
        await user.click(
            screen.getByRole("button", { name: strings.groups.deleteCancelButton }),
        );

        expect(batchCommit).not.toHaveBeenCalled();
        const expectedPrompt = strings.groups.deleteConfirmPrompt.replace(
            "{name}",
            OWNED_GROUP.name,
        );
        expect(screen.queryByText(expectedPrompt)).toBeNull();
    });

    // The pending-requests panel moved to /manage in the UX phase-2 pass —
    // it doesn't render here any more. The badge on GroupDetail's "Manage
    // group" link surfaces the count so it's not hidden; see
    // GroupDetail.test.tsx "surfaces the pending count …" for the coverage
    // that used to live here.
});
