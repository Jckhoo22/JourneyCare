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
import GroupSpend from "./GroupSpend";
import type { Car } from "../../model/Car";

const car = (id: string, nickname: string, totalSpend: number): Car => ({
    id,
    brand: "Perodua",
    model: "Myvi",
    year: 2018,
    nickname,
    access: {},
    lastByType: {},
    statusStamp: {},
    totalSpend,
    createdBy: "owner-uid",
    createdAt: null,
    odometerCorrectedAt: null,
});

const renderPanel = (props: Partial<Parameters<typeof GroupSpend>[0]> = {}) =>
    render(
        <MemoryRouter>
            <UserProvider>
                <LanguageProvider>
                    <GroupSpend
                        groupId="family-car"
                        cars={[]}
                        {...props}
                    />
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

describe("GroupSpend [S1, S3]", () => {
    it("totals the group's cars and breaks it down per car, biggest first", () => {
        renderPanel({
            cars: [
                car("myvi", "Mum's Myvi", 500.5),
                car("saga", "The Saga", 1200),
            ],
        });

        // Headline drops the sen (display size); per-car rows keep two places
        // so the column reads as a stack of comparable numbers. [polish]
        const amounts = screen
            .getAllByText(/^RM /)
            .map((node) => node.textContent);
        expect(amounts).toEqual(["RM 1,701", "RM 1,200.00", "RM 500.50"]);

        expect(screen.getByRole("link", { name: /The Saga/ })).toHaveAttribute(
            "href",
            "/groups/family-car/cars/saga",
        );
    });

    /**
     * A one-car group's per-car row would just repeat the headline — the
     * total IS that car's total. Two-plus cars keep the split. [polish]
     */
    it("suppresses the per-car row for a one-car group", () => {
        renderPanel({ cars: [car("myvi", "Mum's Myvi", 250)] });

        expect(screen.getByText("RM 250")).toBeInTheDocument();
        expect(screen.queryByRole("link")).toBeNull();
    });

    /**
     * Every group is in this state until someone logs a service, and a column
     * of RM 0.00 rows is chrome around nothing. The panel itself stays,
     * because a total that WRONGLY reads zero is exactly when the owner
     * would go looking for Fix totals on the Manage screen. [UX phase-2]
     */
    it("says one sentence instead of a column of zeroes", () => {
        renderPanel({ cars: [car("myvi", "Mum's Myvi", 0)] });

        expect(screen.getByText(strings.spend.groupEmpty)).toBeInTheDocument();
        expect(screen.queryByRole("link")).toBeNull();
        // Headline reads "RM 0" now — the no-decimals option applies at
        // display size regardless of value. [polish]
        expect(screen.getByText("RM 0")).toBeInTheDocument();
    });

    it("renders nothing for a group with no cars", () => {
        const { container } = renderPanel();
        expect(container).toBeEmptyDOMElement();
    });

    /**
     * Fix totals used to live behind a menu on this panel. In the UX
     * phase-2 pass it moved to /manage — a rare owner-only action doesn't
     * belong on a panel every visitor sees. This test pins that decision
     * so a future refactor doesn't quietly re-add the menu.
     */
    it("no longer renders the Fix totals menu (moved to /manage)", () => {
        renderPanel({ cars: [car("myvi", "Mum's Myvi", 100)] });

        expect(
            screen.queryByRole("button", { name: strings.spend.menuLabel }),
        ).toBeNull();
        expect(
            screen.queryByText(strings.spend.recalculate),
        ).toBeNull();
    });
});
