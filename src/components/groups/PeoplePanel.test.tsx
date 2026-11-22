import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../configurations/firebase-config", () => ({
    auth: { currentUser: null },
    db: {},
    googleAuthProvider: {},
    firebaseConfig: { authDomain: "example.firebaseapp.com" },
}));

// LanguageProvider walks up the context stack; nothing else here uses it.
vi.mock("firebase/auth", () => ({
    onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => {
        callback(null);
        return () => {};
    },
}));

vi.mock("firebase/firestore", () => ({
    doc: vi.fn(),
    getDoc: vi.fn(() =>
        Promise.resolve({ exists: () => false, data: () => ({}) }),
    ),
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { ToastProvider } from "../../context/Toast";
import { strings } from "../../locale/English";
import PeoplePanel from "./PeoplePanel";
import type { Car } from "../../model/Car";
import type { Group } from "../../model/Group";

const OWNER = "owner-uid";
const CREATOR = "creator-uid";
const MEMBER = "member-uid";

const baseGroup = (overrides: Partial<Group> = {}): Group => ({
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
    canAddCars: [OWNER, CREATOR],
    joinToken: "0123456789abcdef0123456789abcdef",
    carCount: 2,
    ...overrides,
});

const car = (id: string, overrides: Partial<Car> = {}): Car => ({
    id,
    brand: "Perodua",
    model: "Myvi",
    year: 2018,
    nickname: id === "myvi" ? "Mum's Myvi" : id === "saga" ? "The Saga" : undefined,
    access: {},
    lastByType: {},
    statusStamp: {},
    totalSpend: 0,
    createdBy: CREATOR,
    createdAt: null,
    odometerCorrectedAt: null,
    ...overrides,
});

interface RenderOpts {
    group?: Group;
    cars?: Car[];
    canManage?: boolean;
    onRemove?: ReturnType<typeof vi.fn>;
    onToggleCarAdder?: ReturnType<typeof vi.fn>;
    onTogglePerCar?: ReturnType<typeof vi.fn>;
    onBulkEdit?: ReturnType<typeof vi.fn>;
}

const renderPanel = ({
    group = baseGroup(),
    cars = [car("myvi"), car("saga")],
    canManage = true,
    onRemove = vi.fn(),
    // Handlers resolve to `true` by default — the debounced switches in
    // PeoplePanel await the answer so they can revert the optimistic flip on
    // failure. A non-promise return would leave the hook stuck waiting.
    onToggleCarAdder = vi.fn(() => Promise.resolve(true)),
    onTogglePerCar = vi.fn(() => Promise.resolve(true)),
    onBulkEdit = vi.fn(() => Promise.resolve(true)),
}: RenderOpts = {}) => {
    render(
        <MemoryRouter>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <PeoplePanel
                            group={group}
                            cars={cars}
                            canManage={canManage}
                            onRemove={onRemove}
                            busyUid={null}
                            onToggleCarAdder={onToggleCarAdder}
                            onTogglePerCar={onTogglePerCar}
                            onBulkEdit={onBulkEdit}
                            bulkBusyUid={null}
                            invitePath="/groups/family-car/invite"
                        />
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );
    return { onRemove, onToggleCarAdder, onTogglePerCar, onBulkEdit };
};

/**
 * The roster redesign folds every member's controls under a collapsed row.
 * Tests that want to poke at a member's switches, disclosure, or Remove
 * button need to expand that member's row first. The row's accessible
 * button carries the member's name via its subtree, so `getByRole` +
 * `name: /.../` finds it uniquely.
 */
const expandRowFor = async (
    user: ReturnType<typeof userEvent.setup>,
    name: string,
) => {
    const row = screen
        .getAllByRole("button", { expanded: false })
        .find((btn) => btn.textContent?.includes(name));
    if (!row) throw new Error(`no collapsed row found for ${name}`);
    await user.click(row);
};

describe("PeoplePanel [polish, person-centric, roster redesign]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows every member with owner first and a summary chip", () => {
        renderPanel();

        expect(screen.getByText("Olivia")).toBeInTheDocument();
        expect(screen.getByText("Chris")).toBeInTheDocument();
        expect(screen.getByText("Mia")).toBeInTheDocument();

        // Summary chip on the owner row reads "Owner"; there is exactly one.
        expect(screen.getAllByText(strings.members.ownerBadge)).toHaveLength(1);
    });

    /**
     * The single-member state is the one place the panel replaces its row
     * grammar entirely: no permission UI would mean anything when the owner
     * is alone, so a plain nudge + invite link is what shows instead.
     */
    it("nudges an alone owner to invite people, with no permission UI", () => {
        renderPanel({
            group: baseGroup({
                memberIds: [OWNER],
                members: {
                    [OWNER]: { username: "Olivia", joinedAt: null as never },
                },
                canAddCars: [OWNER],
            }),
            cars: [],
        });

        expect(
            screen.getByText(strings.members.peopleAloneNudge),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /Invite people/ }),
        ).toBeInTheDocument();
        // No bulk switch, no per-car row: the sole non-owner explainer is
        // hidden too, because the nudge carries the whole message.
        expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    });

    /**
     * Owner rows are BADGE-ONLY: their edit-everything and add-cars rights
     * are implicit and can't be revoked, so the row is not expandable and
     * carries no chevron. The Owner summary chip on the collapsed row is
     * the identity signal.
     */
    it("owner row is not expandable — no chevron, no toggle button", () => {
        renderPanel();

        // The Owner summary chip itself is the identity signal.
        expect(
            screen.getByText(strings.members.ownerBadge),
        ).toBeInTheDocument();

        // Exactly two collapsed toggle rows — one for each non-owner member.
        // The owner row does not render as a button.
        expect(
            screen.getAllByRole("button", { expanded: false }),
        ).toHaveLength(2);
    });

    it("collapsed roster shows no switches until a row is expanded", () => {
        renderPanel();

        // Not a single checkbox visible while every row is collapsed.
        expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    });

    /**
     * Derived state: with two cars, one of which grants Mia edit, her bulk
     * toggle is "mixed" — rendered off + a Custom hint. The row's summary
     * ALSO reads "Custom" so the collapsed state matches what the panel
     * shows once expanded.
     */
    it("summary reads Custom when a member's per-car flags disagree", async () => {
        const user = userEvent.setup();
        renderPanel({
            cars: [
                car("myvi", { access: { [MEMBER]: "edit" } }),
                car("saga"),
            ],
        });

        // Custom appears TWICE — once on Mia's row summary, and once as the
        // bulk hint after her row expands. Before expansion it appears just
        // once (the row summary).
        expect(
            screen.getAllByText(strings.members.peopleBulkMixed),
        ).toHaveLength(1);

        await expandRowFor(user, "Mia");

        // Post-expand: the bulk hint appears too.
        expect(
            screen.getByText(strings.members.peopleBulkHint),
        ).toBeInTheDocument();

        // Bulk switch is off — mixed defaults to off with the hint.
        const bulkToggle = screen
            .getAllByRole("checkbox", {
                name: new RegExp(strings.members.peopleBulkLabel),
            })
            .find((el) => !(el as HTMLInputElement).checked);
        expect(bulkToggle).toBeDefined();
    });

    it("flipping the bulk toggle inside the panel calls onBulkEdit", async () => {
        const user = userEvent.setup();
        const { onBulkEdit } = renderPanel();

        // Chris created both cars → his bulk is "always" and renders as a
        // locked line, not a switch, even after expansion. Mia's is the
        // only interactive one, so open her panel first.
        await expandRowFor(user, "Mia");

        const [miaBulk] = screen.getAllByRole("checkbox", {
            name: new RegExp(strings.members.peopleBulkLabel),
        });
        if (!miaBulk) throw new Error("no bulk toggle found for Mia");

        await user.click(miaBulk);

        // The toggles are debounced (600ms trailing) — a click is an
        // intent, and the settled write only fires after the window
        // closes. `waitFor` polls up to 2s in real time so this suite
        // exercises the same clock the app does.
        await waitFor(
            () => expect(onBulkEdit).toHaveBeenCalledTimes(1),
            { timeout: 2000 },
        );
        expect(onBulkEdit.mock.calls[0][0].uid).toBe(MEMBER);
        expect(onBulkEdit.mock.calls[0][1]).toBe(true);
    });

    /**
     * Per-car list is visible directly under a member's toggles in the
     * Members redesign — no nested collapsible any more. Expanding a row
     * shows every car's access cell immediately, and implicit holders
     * keep their "Always" badge so the roster redesign doesn't lose any
     * behaviour.
     */
    it("expanding a row shows per-car cells directly, no disclosure", async () => {
        const user = userEvent.setup();
        renderPanel();

        // Collapsed roster: no per-car cells for anyone yet.
        expect(
            screen.queryAllByRole("checkbox", { name: /Let Mia edit/ }),
        ).toHaveLength(0);

        await expandRowFor(user, "Mia");

        // Both cars appear with a per-car switch for Mia immediately;
        // no extra "Per-car access" button to click.
        expect(
            screen.getByRole("checkbox", { name: /Let Mia edit Mum's Myvi/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("checkbox", { name: /Let Mia edit The Saga/ }),
        ).toBeInTheDocument();

        // The uppercase section label sits above the per-car list.
        expect(
            screen.getByText(strings.members.perCarSectionLabel),
        ).toBeInTheDocument();
    });

    it("read-only viewer sees no interactive switches even after expanding", async () => {
        const user = userEvent.setup();
        renderPanel({ canManage: false });

        // The read-only explainer replaces the manager one.
        expect(
            screen.getByText(strings.members.peopleBodyReadOnly),
        ).toBeInTheDocument();

        // Expanding a row for a read-only viewer still shows no toggles —
        // static text chips replace them.
        await expandRowFor(user, "Mia");
        expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    });

    it("Remove opens a confirm dialog naming the group and consequence", async () => {
        const user = userEvent.setup();
        const { onRemove } = renderPanel();

        // Remove now lives INSIDE Mia's expanded panel body, bottom-right.
        // Expand her row first, then click Remove.
        await expandRowFor(user, "Mia");

        await user.click(
            screen.getByRole("button", {
                name: `${strings.members.remove} Mia`,
            }),
        );

        const expectedPrompt = strings.members.removeConfirmStrong
            .replace("{name}", "Mia")
            .replace("{group}", "Family Cars");
        expect(screen.getByText(expectedPrompt)).toBeInTheDocument();

        // Nothing removed yet — the dialog is armed, not fired.
        expect(onRemove).not.toHaveBeenCalled();

        // Modal confirm reads just "Remove" — the title above it
        // (`Remove member`) supplies the noun.
        await user.click(
            screen.getByRole("button", { name: strings.members.removeYes }),
        );
        expect(onRemove).toHaveBeenCalledTimes(1);
        expect(onRemove.mock.calls[0][0].uid).toBe(MEMBER);
    });

    /**
     * When a member is an implicit holder on EVERY car (they created them
     * all), the bulk toggle has no work — surface a locked "Always" line
     * inside the panel instead of a switch that couldn't move anything.
     * The row's summary chip meanwhile reads "Can edit" — that's the
     * effective outcome and what a reader wants to know at a glance.
     */
    it("panel bulk row degenerates to Always when the member holds edit on every car", async () => {
        const user = userEvent.setup();
        renderPanel({
            cars: [
                car("myvi", { createdBy: MEMBER }),
                car("saga", { createdBy: MEMBER }),
            ],
        });

        // Row summary already reads "Can edit" for Mia before expansion.
        expect(screen.getAllByText(strings.cars.accessOn).length).toBeGreaterThan(0);

        await expandRowFor(user, "Mia");

        // No bulk checkbox in Mia's panel — the locked line replaces it.
        expect(
            screen.queryByRole("checkbox", {
                name: new RegExp(strings.members.peopleBulkLabel),
            }),
        ).toBeNull();

        // The bulk label still surfaces as the locked chip's text.
        expect(
            screen.getAllByText(strings.members.peopleBulkLabel).length,
        ).toBeGreaterThan(0);
    });
});
