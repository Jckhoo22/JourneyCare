import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../configurations/firebase-config", () => ({
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
    doc: vi.fn(),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
}));

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { strings } from "../../locale/English";
import SummaryStrip from "./SummaryStrip";
import { EMPTY_TALLY, type DueTally } from "../../lib/nextDue";
import type { Group } from "../../model/Group";

const group = (
    id: string,
    name: string,
    spendByYear: Record<string, number> = {},
): Group => ({
    id,
    name,
    ownerId: "owner-uid",
    createdAt: null,
    memberIds: ["owner-uid"],
    members: {},
    canAddCars: [],
    joinToken: "token",
    carCount: 1,
    spendByYear,
});

const renderStrip = (props: {
    groups: Group[];
    byGroup: Record<string, DueTally>;
    total?: DueTally;
    year?: string;
    isLoading?: boolean;
}) =>
    render(
        <MemoryRouter>
            <UserProvider>
                <LanguageProvider>
                    <SummaryStrip
                        total={props.total ?? EMPTY_TALLY}
                        isLoading={props.isLoading ?? false}
                        year={props.year ?? "2026"}
                        groups={props.groups}
                        byGroup={props.byGroup}
                    />
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

describe("SummaryStrip [H6, R3, S2, D1, Home polish]", () => {
    /**
     * Single-group view is condensed: one label + one figure. The group name
     * row was dropped in the Home polish pass — with one group naming it is
     * redundant. The label is the shorter "Spent this year" (year implicit).
     */
    it("shows a single-line spend row for a one-group user", () => {
        renderStrip({
            groups: [group("a", "Family Cars", { "2026": 1240.5, "2025": 8000 })],
            byGroup: { a: EMPTY_TALLY },
        });

        expect(
            screen.getByText(strings.spend.stripYearShort),
        ).toBeInTheDocument();
        expect(screen.getByText("RM 1,240.50")).toBeInTheDocument();
        // Last year's figure belongs to last year's strip. [D1]
        expect(screen.queryByText("RM 8,000.00")).toBeNull();
        // No row-link when there's only one group — the whole card is
        // display, not navigation.
        expect(screen.queryByRole("link")).toBeNull();
    });

    /**
     * D1's year boundary, and the whole of its handling: the year is read at
     * render, so on 1 January the lookup asks for a bucket nobody has written
     * and gets zero. Nothing rolls over, so nothing can roll over wrongly.
     */
    it("reads RM 0.00 for a year with no spending in it yet", () => {
        renderStrip({
            groups: [group("a", "Family Cars", { "2026": 1240.5 })],
            byGroup: { a: EMPTY_TALLY },
            year: "2027",
        });

        expect(
            screen.getByText(strings.spend.stripYearShort),
        ).toBeInTheDocument();
        expect(screen.getByText("RM 0.00")).toBeInTheDocument();
    });

    it("carries per-group rows under one 'Spent this year' caption when there are two or more", () => {
        renderStrip({
            groups: [
                group("a", "Family Cars", { "2026": 100 }),
                group("b", "Dad's fleet", { "2026": 900 }),
            ],
            byGroup: {
                a: { dueSoon: 1, overdue: 1 },
                b: EMPTY_TALLY,
            },
            total: { dueSoon: 1, overdue: 1 },
        });

        // One caption for both rows.
        expect(
            screen.getByText(strings.spend.stripYearShort),
        ).toBeInTheDocument();

        // Zone A headline promotes the most urgent count — "1 overdue" wins
        // over "1 due soon" when both are present. The support line names
        // the affected car, but only when carsByGroup is passed (not here).
        expect(screen.getByText("1 overdue")).toBeInTheDocument();

        // The group with something waiting sorts first, whatever it has cost.
        const names = screen
            .getAllByRole("link")
            .map((link) => link.textContent);
        expect(names[0]).toContain("Family Cars");
        expect(names[0]).toContain("RM 100.00");
        expect(names[1]).toContain("Dad's fleet");
    });

    it("still reports spend when nothing is due", () => {
        renderStrip({
            groups: [group("a", "Family Cars", { "2026": 100 })],
            byGroup: { a: EMPTY_TALLY },
        });

        expect(screen.getByText(strings.due.stripNothing)).toBeInTheDocument();
        expect(
            screen.getByText(strings.due.stripAllUpToDate),
        ).toBeInTheDocument();
        expect(screen.getByText("RM 100.00")).toBeInTheDocument();
    });

    it("links each row to its group in the multi-group view", () => {
        renderStrip({
            groups: [
                group("family-car", "Family Cars", { "2026": 100 }),
                group("dads-fleet", "Dad's fleet", { "2026": 900 }),
            ],
            byGroup: {
                "family-car": EMPTY_TALLY,
                "dads-fleet": EMPTY_TALLY,
            },
        });

        const hrefs = screen
            .getAllByRole("link")
            .map((link) => link.getAttribute("href"));
        expect(hrefs).toContain("/groups/family-car");
        expect(hrefs).toContain("/groups/dads-fleet");
    });

    it("renders nothing at all before the counts are known", () => {
        // Otherwise the first paint claims "nothing due" and then contradicts
        // itself a moment later.
        const { container } = renderStrip({
            groups: [group("a", "Family Cars")],
            byGroup: { a: EMPTY_TALLY },
            isLoading: true,
        });

        expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing for someone with no cars anywhere", () => {
        const { container } = renderStrip({
            groups: [group("a", "Family Cars")],
            byGroup: {},
        });

        expect(container).toBeEmptyDOMElement();
    });
});
