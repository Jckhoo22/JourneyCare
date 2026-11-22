import { render, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./Toast";

/**
 * Two invariants the polish spec pins on the toast tray, both new in this
 * pass:
 *   • same-kind toasts REPLACE the existing one — never stack.
 *   • the tray shows AT MOST 2 toasts globally.
 *
 * Neither had a test before because there was no coalescing to break; the
 * old provider just pushed. Now that access toggles fire coalesced feedback,
 * a regression here would show up as a stack of identical "granted" cards
 * covering the screen.
 */

const Harness = ({
    onReady,
}: {
    onReady: (add: ReturnType<typeof useToast>["addToast"]) => void;
}) => {
    const { addToast } = useToast();
    onReady(addToast);
    return null;
};

const setup = () => {
    let addToast: ReturnType<typeof useToast>["addToast"] = () => {};
    render(
        <ToastProvider>
            <Harness
                onReady={(add) => {
                    addToast = add;
                }}
            />
        </ToastProvider>,
    );
    return {
        add: (...args: Parameters<typeof addToast>) => {
            act(() => addToast(...args));
        },
        // The visible toast bodies, in DOM order.
        messages: () =>
            Array.from(document.querySelectorAll(".toast-content")).map(
                (node) => node.textContent,
            ),
    };
};

describe("ToastProvider", () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it("replaces an existing toast when a second of the same kind arrives", () => {
        const { add, messages } = setup();
        add("Granted Mia edit for the Myvi", "info", { kind: "access:mia" });
        add("Revoked Mia edit for the Myvi", "info", { kind: "access:mia" });

        expect(messages()).toEqual(["Revoked Mia edit for the Myvi"]);
    });

    it("stacks toasts of different kinds — but caps at two", () => {
        const { add, messages } = setup();
        add("A", "info", { kind: "a" });
        add("B", "info", { kind: "b" });
        add("C", "info", { kind: "c" });

        // Oldest evicted; the two most recent survive.
        expect(messages()).toEqual(["B", "C"]);
    });

    it("caps kindless toasts at two as well", () => {
        const { add, messages } = setup();
        add("first");
        add("second");
        add("third");

        expect(messages()).toEqual(["second", "third"]);
    });

    it("counts a same-kind refresh against the current slot, not the cap", () => {
        const { add, messages } = setup();
        add("keep", "info", { kind: "keep" });
        // Refreshing "keep" repeatedly must not evict the sibling below.
        add("sibling", "info", { kind: "sibling" });
        add("keep — updated", "info", { kind: "keep" });
        add("keep — updated again", "info", { kind: "keep" });

        expect(messages()).toEqual(["keep — updated again", "sibling"]);
    });
});
