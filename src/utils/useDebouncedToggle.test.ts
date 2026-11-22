import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedToggle } from "./useDebouncedToggle";

/**
 * The coalescing contract this hook exists for. Every case below matches a
 * scenario the polish spec calls out for access toggles: rapid-flip → one
 * write, flip on-off → zero writes, single flip → exactly one write, and a
 * failed write reverts the optimistic flip.
 *
 * The debounce runs in REAL TIME. Fake timers fight `waitFor`'s own async
 * pacing and mask the microtask ordering the hook actually depends on, so a
 * short `waitFor(..., 2s)` is the honest way to observe the trailing edge.
 * The 60ms delay used here keeps each test comfortably under a second while
 * still exercising the same code path production runs at 600ms.
 */
describe("useDebouncedToggle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("collapses a rapid flip-flip-flip into ONE settled write", async () => {
        const onSettle = vi.fn(() => Promise.resolve(true));
        const { result } = renderHook(() =>
            useDebouncedToggle({
                serverValue: false,
                delayMs: 60,
                onSettle,
            }),
        );

        act(() => result.current.onChange(true));
        act(() => result.current.onChange(false));
        act(() => result.current.onChange(true));

        // Before the window closes, nothing has fired yet — the UI is
        // optimistic while the clock ticks.
        expect(onSettle).not.toHaveBeenCalled();
        expect(result.current.value).toBe(true);

        await waitFor(() => expect(onSettle).toHaveBeenCalledTimes(1), {
            timeout: 500,
        });
        expect(onSettle).toHaveBeenCalledWith(true);
    });

    it("fires ZERO writes when the window closes back at the original value", async () => {
        const onSettle = vi.fn(() => Promise.resolve(true));
        const { result } = renderHook(() =>
            useDebouncedToggle({
                serverValue: false,
                delayMs: 60,
                onSettle,
            }),
        );

        // Flip on, then flip back off inside the same window.
        act(() => result.current.onChange(true));
        act(() => result.current.onChange(false));

        // Wait comfortably past the window; the settle should NOT fire.
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(onSettle).not.toHaveBeenCalled();
        expect(result.current.value).toBe(false);
    });

    it("locks the switch and reports `pending` during the write round-trip", async () => {
        let resolveSettle: (ok: boolean) => void = () => {};
        const onSettle = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    resolveSettle = resolve;
                }),
        );
        const { result } = renderHook(() =>
            useDebouncedToggle({
                serverValue: false,
                delayMs: 60,
                onSettle,
            }),
        );

        act(() => result.current.onChange(true));

        // Wait for the window to close and the commit to start.
        await waitFor(() => expect(result.current.pending).toBe(true), {
            timeout: 500,
        });

        // In-flight lock: another flip while pending is a no-op.
        act(() => result.current.onChange(false));
        expect(result.current.value).toBe(true);
        expect(onSettle).toHaveBeenCalledTimes(1);

        // Resolve the commit; pending clears.
        act(() => resolveSettle(true));
        await waitFor(() => expect(result.current.pending).toBe(false), {
            timeout: 500,
        });
    });

    it("reverts the optimistic value and calls onError when the write fails", async () => {
        const onSettle = vi.fn(() => Promise.resolve(false));
        const onError = vi.fn();
        const { result } = renderHook(() =>
            useDebouncedToggle({
                serverValue: false,
                delayMs: 60,
                onSettle,
                onError,
            }),
        );

        act(() => result.current.onChange(true));
        // Optimistic: the switch already shows the intended value.
        expect(result.current.value).toBe(true);

        await waitFor(() => expect(onSettle).toHaveBeenCalledTimes(1), {
            timeout: 500,
        });

        // Failure path: local reverts, friendly-error callback fires.
        await waitFor(() => expect(result.current.value).toBe(false), {
            timeout: 500,
        });
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("mirrors serverValue changes while idle", async () => {
        const onSettle = vi.fn(() => Promise.resolve(true));
        const { result, rerender } = renderHook(
            ({ serverValue }: { serverValue: boolean }) =>
                useDebouncedToggle({
                    serverValue,
                    delayMs: 60,
                    onSettle,
                }),
            { initialProps: { serverValue: false } },
        );

        expect(result.current.value).toBe(false);
        rerender({ serverValue: true });
        expect(result.current.value).toBe(true);
        expect(onSettle).not.toHaveBeenCalled();
    });
});
