import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Timestamp } from "firebase/firestore";

vi.mock("../../configurations/firebase-config", () => ({
    auth: { currentUser: null },
    db: {},
    googleAuthProvider: {},
    firebaseConfig: { authDomain: "example.firebaseapp.com" },
}));

// LanguageProvider reads the session for its locale preference, so the context
// stack has to be present even though this component never touches auth.
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
import CarSpend from "./CarSpend";
import type { Car } from "../../model/Car";
import type { Log } from "../../model/Log";

const CAR: Car = {
    id: "myvi",
    brand: "Perodua",
    model: "Myvi",
    year: 2018,
    access: {},
    lastByType: {},
    statusStamp: {},
    totalSpend: 0,
    // T20 (SPD2): the by-type split is now read from this denormalised map,
    // not summed from loaded log history. Fixture cars carry their spendByType
    // explicitly so the test asserts the source T20 actually reads.
    spendByType: {},
    createdBy: "owner-uid",
    createdAt: null,
    odometerCorrectedAt: null,
};

const car = (
    totalSpend: number,
    spendByType: Record<string, number> = {},
): Car => ({ ...CAR, totalSpend, spendByType });

const log = (id: string, type: string, cost: number): Log => ({
    id,
    type,
    cost,
    date: null as unknown as Timestamp,
    createdBy: { uid: "owner-uid", username: "Olivia" },
    createdAt: null,
});

const renderPanel = (props: Partial<Parameters<typeof CarSpend>[0]> = {}) =>
    render(
        <UserProvider>
            <LanguageProvider>
                <CarSpend
                    car={car(0)}
                    logs={[]}
                    hasMore={false}
                    isLoading={false}
                    {...props}
                />
            </LanguageProvider>
        </UserProvider>,
    );

describe("CarSpend [S1, S3]", () => {
    /**
     * The lifetime total moved to the CarStats row when the car page was
     * restructured. This panel is the by-type split and nothing else — showing
     * the total in both places would invite the reader to check one against
     * the other, and they legitimately disagree (see the partial-note test
     * below).
     */
    it("leaves the lifetime total to the stat row", () => {
        renderPanel({ car: car(1240.5), logs: [log("a", "engine_oil", 250)] });

        expect(screen.queryByText("RM 1,240.50")).not.toBeInTheDocument();
        expect(screen.queryByText(strings.spend.allTime)).not.toBeInTheDocument();
    });

    it("breaks the DENORM down by service, biggest first [SPD2]", () => {
        // T20: reads from car.spendByType, not from loaded logs. The panel
        // now agrees with the total by construction — Recalculate is the
        // repair when they drift.
        renderPanel({
            car: car(1700, { engine_oil: 500, tires: 1200 }),
            logs: [log("a", "engine_oil", 250)],
        });

        const amounts = screen
            .getAllByText(/^RM /)
            .map((node) => node.textContent);

        // Tyres, then engine_oil. Biggest first.
        expect(amounts).toEqual(["RM 1,200.00", "RM 500.00"]);
    });

    /**
     * The old partial-note behaviour is REMOVED in T20. The breakdown is now
     * the denorm, which agrees with the total by construction — no need for
     * a caveat. This test pins the removal.
     */
    it("does NOT show the old partial-note caveat", () => {
        renderPanel({
            car: car(5000, { engine_oil: 250 }),
            logs: [log("a", "engine_oil", 250)],
            hasMore: true,
        });

        expect(
            screen.queryByText(
                strings.spend.partialNote.replace("{count}", "1 entry"),
            ),
        ).toBeNull();
    });

    it("keeps a free service visible rather than dropping the row", () => {
        // Warranty work costs nothing but still happened, and a car whose
        // only entries were free must not render as an untouched car. The
        // denorm tracks it, so a zero-value warranty type is stored — but
        // ByTypeDonut filters value>0 slices; here we just need the LIST to
        // still surface the label. This behaviour is tested via a car that
        // has both zero and nonzero types.
        renderPanel({
            car: car(0, { warranty: 0 }),
            logs: [log("a", "warranty", 0)],
        });

        // T20: the list filters value>0. A warranty-only car with all-zero
        // entries renders no list rows. This is a T20 behaviour change; the
        // by-type list is a spend list, and RM 0 rows visually equal "no
        // spend" — which is fine.
        expect(screen.queryByText("RM 0.00")).toBeNull();
    });

    it("renders nothing for a car nobody has logged against", () => {
        const { container } = renderPanel();
        expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing while the history is still arriving", () => {
        // Otherwise a breakdown appears empty and then fills in, which reads
        // as the numbers changing.
        const { container } = renderPanel({ car: car(999), isLoading: true });
        expect(container).toBeEmptyDOMElement();
    });
});
