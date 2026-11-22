import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Timestamp } from "firebase/firestore";

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

import { MemoryRouter } from "react-router";

import { UserProvider } from "../../context/UserContext";
import { LanguageProvider } from "../../context/LanguageContext";
import { strings } from "../../locale/English";
import LogHistory from "./LogHistory";
import type { Log } from "../../model/Log";

const stamp = (iso: string): Timestamp =>
    ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) }) as Timestamp;

const log = (over: Partial<Log> & { id: string }): Log => ({
    type: "engine_oil",
    cost: 250,
    date: stamp("2026-03-12T00:00:00Z"),
    createdBy: { uid: "u1", username: "Jie" },
    createdAt: stamp("2026-03-12T00:00:00Z"),
    ...over,
});

/**
 * Nine entries so the SEARCH_THRESHOLD (>8) gate opens for these tests.
 * The three semantic entries (a/b/c) are what every search assertion below
 * probes; the six padding entries have to be distinct enough not to match
 * any of the queries the tests type — "tyre", "compressor", "yong seng",
 * "1200", "ali", "oil", "gearbox".
 */
const LOGS: Log[] = [
    log({ id: "a", type: "engine_oil", cost: 250 }),
    log({ id: "b", type: "tires", cost: 1200, createdBy: { uid: "u2", username: "Ali" } }),
    log({
        id: "c",
        type: "custom",
        customLabel: "Aircond compressor",
        cost: 900,
        notes: "Done at Yong Seng Auto",
    }),
    log({ id: "p1", type: "custom", customLabel: "Brake pads", cost: 400, createdBy: { uid: "u3", username: "Ravi" } }),
    log({ id: "p2", type: "custom", customLabel: "Battery replacement", cost: 350, createdBy: { uid: "u4", username: "Mei" } }),
    log({ id: "p3", type: "custom", customLabel: "Aircond service", cost: 180, createdBy: { uid: "u5", username: "Faiz" } }),
    log({ id: "p4", type: "custom", customLabel: "Wiper blades", cost: 60, createdBy: { uid: "u6", username: "Ling" } }),
    log({ id: "p5", type: "custom", customLabel: "Car wash", cost: 25, createdBy: { uid: "u7", username: "Sam" } }),
    log({ id: "p6", type: "custom", customLabel: "Cabin filter", cost: 90, createdBy: { uid: "u8", username: "Rui" } }),
];

const renderHistory = (over: Partial<Parameters<typeof LogHistory>[0]> = {}) =>
    render(
        <MemoryRouter>
            <UserProvider>
                <LanguageProvider>
                    <LogHistory
                        groupId="g1"
                        carId="c1"
                        logs={LOGS}
                        isLoading={false}
                        hasMore={false}
                        onLoadMore={vi.fn()}
                        error={null}
                        canEdit={false}
                        onDelete={vi.fn()}
                        isDeleting={false}
                        {...over}
                    />
                </LanguageProvider>
            </UserProvider>
        </MemoryRouter>,
    );

const searchBox = () => screen.getByLabelText(strings.logs.searchLabel);
const rowLabels = () =>
    screen.getAllByRole("listitem").map((item) => item.textContent ?? "");

describe("LogHistory search [L6]", () => {
    it("shows every loaded entry before anything is typed", () => {
        renderHistory();
        expect(rowLabels()).toHaveLength(LOGS.length);
    });

    it("filters as you type, without a submit", async () => {
        const user = userEvent.setup();
        renderHistory();

        await user.type(searchBox(), "tyre");

        const rows = rowLabels();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toContain("Tyres");
    });

    it("finds a custom entry by the label the user gave it", async () => {
        const user = userEvent.setup();
        renderHistory();

        await user.type(searchBox(), "compressor");

        expect(rowLabels()).toHaveLength(1);
    });

    it("finds an entry by a workshop written in its notes", async () => {
        // There is no workshop field on a log; people put it in the notes.
        const user = userEvent.setup();
        renderHistory();

        await user.type(searchBox(), "yong seng");

        expect(rowLabels()).toHaveLength(1);
    });

    it("finds an entry by cost", async () => {
        const user = userEvent.setup();
        renderHistory();

        await user.type(searchBox(), "1200");

        expect(rowLabels()).toHaveLength(1);
        expect(rowLabels()[0]).toContain("Tyres");
    });

    it("finds an entry by who logged it", async () => {
        const user = userEvent.setup();
        renderHistory();

        await user.type(searchBox(), "ali");

        expect(rowLabels()).toHaveLength(1);
    });

    it("reports how many matched", async () => {
        const user = userEvent.setup();
        renderHistory();

        await user.type(searchBox(), "oil");
        expect(screen.getByRole("status")).toHaveTextContent(
            strings.logs.searchCount.replace("{count}", "1"),
        );
    });

    it("says nothing matched, distinctly from having no history", async () => {
        const user = userEvent.setup();
        renderHistory();

        await user.type(searchBox(), "gearbox");

        expect(screen.queryAllByRole("listitem")).toHaveLength(0);
        expect(
            screen.getByText(
                strings.logs.searchEmptyTitle.replace("{query}", "gearbox"),
            ),
        ).toBeInTheDocument();
        // NOT the "no services logged yet" copy — history has entries.
        expect(screen.queryByText(strings.logs.emptyTitle)).not.toBeInTheDocument();
    });

    it("clears back to the full list", async () => {
        const user = userEvent.setup();
        renderHistory();

        await user.type(searchBox(), "tyre");
        expect(rowLabels()).toHaveLength(1);

        await user.click(screen.getByRole("button", { name: strings.logs.searchClear }));

        expect(rowLabels()).toHaveLength(LOGS.length);
        expect(searchBox()).toHaveValue("");
    });

    it("offers no clear button until there is something to clear", () => {
        renderHistory();
        expect(
            screen.queryByRole("button", { name: strings.logs.searchClear }),
        ).not.toBeInTheDocument();
    });

    /**
     * The known limitation, stated in the UI rather than left for the user to
     * infer. Searching only what's loaded is fine; letting an empty result
     * imply "that service never happened" is not.
     */
    it("says the search only covered the loaded page when more exists", async () => {
        const user = userEvent.setup();
        renderHistory({ hasMore: true });

        await user.type(searchBox(), "gearbox");
        expect(screen.getByText(strings.logs.searchScopeNote)).toBeInTheDocument();
    });

    it("says so next to results too, not only when nothing matched", async () => {
        const user = userEvent.setup();
        renderHistory({ hasMore: true });

        await user.type(searchBox(), "tyre");
        expect(rowLabels()).toHaveLength(1);
        expect(screen.getByText(strings.logs.searchScopeNote)).toBeInTheDocument();
    });

    it("keeps quiet about scope when the whole history is loaded", async () => {
        const user = userEvent.setup();
        renderHistory({ hasMore: false });

        await user.type(searchBox(), "tyre");
        expect(
            screen.queryByText(strings.logs.searchScopeNote),
        ).not.toBeInTheDocument();
    });

    it("hides the box for a history too short to need it", () => {
        renderHistory({ logs: [LOGS[0]] });
        expect(
            screen.queryByLabelText(strings.logs.searchLabel),
        ).not.toBeInTheDocument();
    });

    it("hides the box entirely when there is no history", () => {
        renderHistory({ logs: [] });

        expect(
            screen.queryByLabelText(strings.logs.searchLabel),
        ).not.toBeInTheDocument();
        expect(screen.getByText(strings.logs.emptyTitle)).toBeInTheDocument();
    });
});
