import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
    /** Server truth from the listener. When the user isn't mid-flip and no
     *  write is in flight, the toggle mirrors this. */
    serverValue: boolean;
    /** Trailing debounce, ms. A flip on-off-on inside the window fires ONE
     *  settled write; a flip that ends where it started fires ZERO. */
    delayMs?: number;
    /**
     * Runs after the debounce settles and only when the settled value differs
     * from where the window opened. Resolves to `true` on success. On `false`
     * the hook reverts the optimistic UI to `serverValue` and calls
     * `onError` — the caller is not asked to undo anything.
     */
    onSettle: (value: boolean) => Promise<boolean>;
    /** Fired when a settled write is rejected. Meant for the friendly toast —
     *  the visual revert is already done by the time this runs. */
    onError?: () => void;
}

interface Result {
    /** What the switch should render right now — optimistic during the
     *  debounce window and while the write is committing. */
    value: boolean;
    /** True from the moment the debounce fires until the write resolves.
     *  Callers disable the switch while true so no second flip can queue on
     *  top of a round-trip — matches the "one flip round-trips before the
     *  next is accepted" contract. */
    pending: boolean;
    /** Call from the switch's onChange. Ignored while `pending`. */
    onChange: (next: boolean) => void;
}

/**
 * Optimistic switch with a trailing debounce, an in-flight lock, and a
 * revert-on-failure path.
 *
 * Lives here because the toggles in PeoplePanel wanted three overlapping
 * behaviours — optimistic flip, coalesced writes, and a lock during the
 * round-trip — and doing them ad-hoc in each cell would have been three
 * copies of the same book-keeping. A single hook keeps every access toggle
 * (per-car, bulk, canAddCars) on the same clock.
 *
 * ── The three phases ────────────────────────────────────────────────────────
 *   • idle       — no window, no timer, no in-flight write. The rendered
 *                  value mirrors `serverValue` from the listener.
 *   • debouncing — user has flipped at least once. Each flip resets the
 *                  timer; the rendered value is the optimistic local state.
 *                  The switch stays interactive — the window is where a
 *                  flip on-off-on collapses to nothing.
 *   • committing — timer fired, write is in flight. The switch is locked
 *                  (`pending`) so no second flip can queue on top.
 *
 * ── What is NOT here ────────────────────────────────────────────────────────
 * Toasting. The hook returns `pending` and hands failures to `onError`; the
 * caller decides what to say and with which `kind`, because success copy
 * ("Granted Mia edit for the Myvi") needs data the hook doesn't hold.
 *
 * Notification dedupe. Because the settled write fires at most once per
 * window, and the notification is in the same `writeBatch` as the write, the
 * dedupe is automatic — no separate bookkeeping needed.
 */
export const useDebouncedToggle = ({
    serverValue,
    delayMs = 600,
    onSettle,
    onError,
}: Options): Result => {
    const [local, setLocal] = useState(serverValue);
    const [pending, setPending] = useState(false);

    /** The value the window opened at. If the settled value equals this,
     *  nothing was really flipped and no write should fire. `null` while
     *  idle. */
    const originalRef = useRef<boolean | null>(null);
    /** Live copy of `serverValue` for use inside async callbacks. */
    const serverRef = useRef(serverValue);
    /** The trailing debounce handle. Cleared on every new flip and on
     *  unmount. */
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** True from the timer firing until the write resolves. Reads as
     *  `pending` above; kept as a ref too so the effect that mirrors
     *  `serverValue` can see it without depending on state. */
    const committingRef = useRef(false);

    // Mirror serverValue into the local state while the toggle is idle. A
    // listener update landing mid-window would otherwise clobber the
    // optimistic flip the user is looking at.
    useEffect(() => {
        serverRef.current = serverValue;
        if (originalRef.current === null && !committingRef.current) {
            setLocal(serverValue);
        }
    }, [serverValue]);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, []);

    const onChange = useCallback(
        (next: boolean) => {
            // In-flight lock. A flip during the round-trip would be queuing
            // — the contract forbids that.
            if (committingRef.current) return;

            // The first flip in a window records where we started, so a
            // settled write that lands back at that value can fire zero
            // writes.
            if (originalRef.current === null) {
                originalRef.current = serverRef.current;
            }
            setLocal(next);

            if (timerRef.current !== null) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                const settled = next; // captured by the closure; kept as a
                                       // separate name so the intent reads.
                const original = originalRef.current;

                // A flip that ended where it started: no write, no
                // notification, no toast. Reset the window and let the
                // listener continue to drive `local`.
                if (original === settled) {
                    originalRef.current = null;
                    return;
                }

                committingRef.current = true;
                setPending(true);
                void (async () => {
                    let ok = false;
                    try {
                        ok = await onSettle(settled);
                    } catch (error) {
                        // onSettle is documented to resolve rather than
                        // throw, but a caller that forgets shouldn't leave
                        // the toggle stuck.
                        console.error("Debounced toggle onSettle threw:", error);
                        ok = false;
                    }
                    if (ok) {
                        // Success: the server value will arrive via the
                        // listener; nothing to do here except close the
                        // window.
                        originalRef.current = null;
                    } else {
                        // Failure: put the switch back where it started.
                        // The friendly toast is the caller's job.
                        setLocal(original ?? serverRef.current);
                        originalRef.current = null;
                        onError?.();
                    }
                    committingRef.current = false;
                    setPending(false);
                })();
            }, delayMs);
        },
        [delayMs, onSettle, onError],
    );

    return { value: local, pending, onChange };
};
