import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDoc, setDoc } = vi.hoisted(() => ({
    getDoc: vi.fn(),
    setDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock("../configurations/firebase-config", () => ({
    auth: { currentUser: null },
    db: {},
    googleAuthProvider: {},
    firebaseConfig: { authDomain: "example.firebaseapp.com" },
}));

vi.mock("firebase/firestore", () => ({
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
        path: segments.join("/"),
    })),
    getDoc,
    setDoc,
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    serverTimestamp: () => "SERVER_TIMESTAMP",
    increment: (by: number) => ({ __increment: by }),
    writeBatch: vi.fn(() => ({
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn(() => Promise.resolve()),
    })),
}));

import { ensurePublicInfo } from "./GroupsController";
import type { Group } from "../model/Group";

const GROUP: Group = {
    id: "family-car",
    name: "Family Cars",
    ownerId: "owner-uid",
    createdAt: null,
    memberIds: ["owner-uid"],
    members: {},
    canAddCars: ["owner-uid"],
    joinToken: "0123456789abcdef0123456789abcdef",
};

const publicInfo = (data: Record<string, unknown> | null) => {
    getDoc.mockResolvedValue({
        exists: () => data !== null,
        data: () => data,
    });
};

/**
 * `groups/{id}/public/info` is the invited-stranger window. It carries two
 * fields and BOTH matter: `name` so an invitee can see what they're joining,
 * and `ownerId` so their join request can be addressed to somebody. [G5, N1]
 */
describe("ensurePublicInfo [Item 2, N1]", () => {
    beforeEach(() => {
        getDoc.mockReset();
        setDoc.mockClear();
    });

    it("writes the window when it doesn't exist yet", async () => {
        publicInfo(null);
        await ensurePublicInfo(GROUP);

        expect(setDoc).toHaveBeenCalledWith(expect.anything(), {
            name: "Family Cars",
            ownerId: "owner-uid",
        });
    });

    /**
     * The root cause of the missing join notifications.
     *
     * This document predates `ownerId` being part of its shape. The old check
     * compared the name alone, found it matching, and returned early — so the
     * repair never happened, and every join request against this group posted
     * with nobody to notify. Silently, and forever.
     */
    it("repairs a window that has the right name but no ownerId", async () => {
        publicInfo({ name: "Family Cars" });
        await ensurePublicInfo(GROUP);

        expect(setDoc).toHaveBeenCalledWith(expect.anything(), {
            name: "Family Cars",
            ownerId: "owner-uid",
        });
    });

    it("repairs a window whose ownerId is stale", async () => {
        publicInfo({ name: "Family Cars", ownerId: "someone-else" });
        await ensurePublicInfo(GROUP);

        expect(setDoc).toHaveBeenCalledWith(expect.anything(), {
            name: "Family Cars",
            ownerId: "owner-uid",
        });
    });

    it("re-syncs the name after a rename", async () => {
        publicInfo({ name: "Old Name", ownerId: "owner-uid" });
        await ensurePublicInfo(GROUP);

        expect(setDoc).toHaveBeenCalledWith(expect.anything(), {
            name: "Family Cars",
            ownerId: "owner-uid",
        });
    });

    // Idempotent: the owner opens this screen often, and it must not cost a
    // write every time.
    it("writes nothing when both fields already match", async () => {
        publicInfo({ name: "Family Cars", ownerId: "owner-uid" });
        await ensurePublicInfo(GROUP);

        expect(setDoc).not.toHaveBeenCalled();
    });
});
