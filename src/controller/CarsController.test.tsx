import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";

const { batchUpdate, batchSet, batchCommit, writeBatch, collection, doc } =
    vi.hoisted(() => ({
        batchUpdate: vi.fn(),
        batchSet: vi.fn(),
        batchCommit: vi.fn(() => Promise.resolve()),
        writeBatch: vi.fn(),
        collection: vi.fn((_db: unknown, ...segments: string[]) => ({
            path: segments.join("/"),
        })),
        doc: vi.fn(
            (
                _dbOrParent: unknown,
                ...segments: string[]
            ): { path: string } => {
                // collection() returned a { path } — passing that back into
                // doc() (auto-id form) makes the test expose whatever segments
                // were used, plus an "auto" tail so different call sites
                // produce distinguishable refs.
                if (
                    _dbOrParent &&
                    typeof _dbOrParent === "object" &&
                    "path" in _dbOrParent
                ) {
                    return {
                        path: `${(_dbOrParent as { path: string }).path}/AUTO`,
                    };
                }
                return { path: segments.join("/") };
            },
        ),
    }));

vi.mock("../configurations/firebase-config", () => ({
    auth: { currentUser: null },
    db: {},
    googleAuthProvider: {},
    firebaseConfig: { authDomain: "example.firebaseapp.com" },
}));

vi.mock("firebase/auth", () => ({
    onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => {
        callback(null);
        return () => {};
    },
}));

vi.mock("firebase/firestore", () => ({
    doc,
    collection,
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
    updateDoc: vi.fn(),
    deleteField: vi.fn(() => "DELETE"),
    serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
    increment: vi.fn((by: number) => ({ __increment: by })),
    writeBatch: () => {
        writeBatch();
        return {
            set: batchSet,
            update: batchUpdate,
            delete: vi.fn(),
            commit: batchCommit,
        };
    },
}));

import { UserProvider } from "../context/UserContext";
import { LanguageProvider } from "../context/LanguageContext";
import { ToastProvider } from "../context/Toast";
import { useCarAccessActions } from "./CarsController";
import type { Car } from "../model/Car";
import type { Group } from "../model/Group";

const OWNER = "owner-uid";
const CREATOR = "creator-uid";
const MEMBER = "member-uid";

const group: Group = {
    id: "family-car",
    name: "Family Cars",
    ownerId: OWNER,
    createdAt: null,
    memberIds: [OWNER, CREATOR, MEMBER],
    members: {
        [OWNER]: { username: "Olivia", joinedAt: null as never },
        [CREATOR]: { username: "Chris", joinedAt: null as never },
        [MEMBER]: { username: "Mia", joinedAt: null as never },
    },
    canAddCars: [OWNER],
    joinToken: "0123456789abcdef0123456789abcdef",
    carCount: 2,
};

const car = (id: string, overrides: Partial<Car> = {}): Car => ({
    id,
    brand: "Perodua",
    model: "Myvi",
    year: 2018,
    access: {},
    lastByType: {},
    statusStamp: {},
    totalSpend: 0,
    createdBy: CREATOR,
    createdAt: null,
    odometerCorrectedAt: null,
    ...overrides,
});

const Providers = ({ children }: PropsWithChildren) => (
    <UserProvider>
        <LanguageProvider>
            <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
    </UserProvider>
);

/**
 * The bulk edit path is a UI convenience over the per-car write shape — it
 * MUST land the exact same batch entries `setCarEdit` would emit, just in one
 * commit. That invariant is what keeps it inside the rules the per-car switch
 * already rides (isAccessUpdate on cars, isAccessChangedNotice on
 * notifications), and it is the whole reason no rules change was needed.
 */
describe("useCarAccessActions.setCarEditBulk [polish, C6, C7]", () => {
    beforeEach(() => {
        batchUpdate.mockClear();
        batchSet.mockClear();
        batchCommit.mockClear();
        writeBatch.mockClear();
    });

    /** The verification #5 case: 2-car group, member currently has no access,
        flip bulk ON → exactly two per-car access writes + two notifications,
        one commit. Nothing else in the batch. */
    it("flipping ON in a 2-car group writes exactly 2 access updates + 2 notifications", async () => {
        const { result } = renderHook(
            () => useCarAccessActions("family-car"),
            { wrapper: Providers },
        );

        await act(async () => {
            await result.current.setCarEditBulk(
                group,
                [car("myvi"), car("saga")],
                MEMBER,
                true,
            );
        });

        expect(writeBatch).toHaveBeenCalledTimes(1);
        expect(batchCommit).toHaveBeenCalledTimes(1);
        // Two per-car updates.
        expect(batchUpdate).toHaveBeenCalledTimes(2);
        // Two matching notifications, one per car.
        expect(batchSet).toHaveBeenCalledTimes(2);

        // Update targets are the two car docs, and each update touches only
        // `access` — the diff shape the rules' isAccessUpdate branch allows.
        const updatedPaths = batchUpdate.mock.calls.map(
            (call) => (call[0] as { path: string }).path,
        );
        expect(updatedPaths).toContain("groups/family-car/cars/myvi");
        expect(updatedPaths).toContain("groups/family-car/cars/saga");
        for (const call of batchUpdate.mock.calls) {
            const payload = call[1] as Record<string, unknown>;
            expect(Object.keys(payload)).toEqual(["access"]);
            // Mia is now in the map with 'edit'.
            expect(payload.access).toMatchObject({ [MEMBER]: "edit" });
        }

        // Notifications land under the recipient's own inbox.
        for (const call of batchSet.mock.calls) {
            const path = (call[0] as { path: string }).path;
            expect(path.startsWith(`notifications/${MEMBER}/items/`)).toBe(true);
            const payload = call[1] as { type: string; payload: { granted: boolean } };
            expect(payload.type).toBe("access_changed");
            expect(payload.payload.granted).toBe(true);
        }
    });

    /** Mixed → ON should only write the cars that need to change. Writing a
        flag that already matches would send a stray "you gained access"
        notification for something that did not move. */
    it("only writes the cars that need to change", async () => {
        const { result } = renderHook(
            () => useCarAccessActions("family-car"),
            { wrapper: Providers },
        );

        // Mia already has edit on the Myvi; only the Saga should get a write.
        await act(async () => {
            await result.current.setCarEditBulk(
                group,
                [
                    car("myvi", { access: { [MEMBER]: "edit" } }),
                    car("saga"),
                ],
                MEMBER,
                true,
            );
        });

        expect(batchUpdate).toHaveBeenCalledTimes(1);
        expect(batchSet).toHaveBeenCalledTimes(1);
        const updatedPath = (batchUpdate.mock.calls[0][0] as { path: string })
            .path;
        expect(updatedPath).toBe("groups/family-car/cars/saga");
    });

    /** Implicit holders (owner, creator) get no per-car write — their edit
        cannot be revoked and cannot be granted through the map either. */
    it("skips cars where the member is an implicit holder", async () => {
        const { result } = renderHook(
            () => useCarAccessActions("family-car"),
            { wrapper: Providers },
        );

        // Chris is the creator of both cars → the bulk is a no-op.
        const outcome = await act(() =>
            result.current.setCarEditBulk(
                group,
                [car("myvi"), car("saga")],
                CREATOR,
                true,
            ),
        );

        expect(outcome).toBe(true);
        expect(writeBatch).not.toHaveBeenCalled();
        expect(batchCommit).not.toHaveBeenCalled();
    });

    /** Owner never gets a bulk write — their edit is implicit on every car
        in the group, and the UI shouldn't be able to ask in the first place.
        Belt to that pair of braces. */
    it("refuses to write anything for the group owner", async () => {
        const { result } = renderHook(
            () => useCarAccessActions("family-car"),
            { wrapper: Providers },
        );

        await act(async () => {
            await result.current.setCarEditBulk(
                group,
                [car("myvi"), car("saga")],
                OWNER,
                true,
            );
        });

        expect(writeBatch).not.toHaveBeenCalled();
        expect(batchCommit).not.toHaveBeenCalled();
    });

    it("flipping OFF revokes only the cars currently held", async () => {
        const { result } = renderHook(
            () => useCarAccessActions("family-car"),
            { wrapper: Providers },
        );

        await act(async () => {
            await result.current.setCarEditBulk(
                group,
                [
                    car("myvi", { access: { [MEMBER]: "edit" } }),
                    car("saga", { access: { [MEMBER]: "edit" } }),
                    car("persona"), // Mia doesn't have edit here — no write.
                ],
                MEMBER,
                false,
            );
        });

        expect(batchUpdate).toHaveBeenCalledTimes(2);
        expect(batchSet).toHaveBeenCalledTimes(2);
        for (const call of batchUpdate.mock.calls) {
            const payload = call[1] as { access: Record<string, string> };
            expect(payload.access[MEMBER]).toBeUndefined();
        }
        for (const call of batchSet.mock.calls) {
            const payload = call[1] as { payload: { granted: boolean } };
            expect(payload.payload.granted).toBe(false);
        }
    });
});
