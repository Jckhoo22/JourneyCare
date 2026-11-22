import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stayed truthy for `delayMs`. A load that
 * resolves faster than the delay never gates on it.
 *
 * The whole reason this hook exists: a skeleton that flashes for one frame
 * is worse than none. Firestore's local cache returns synchronously, so an
 * already-visited screen usually flips from loading to loaded before the
 * user could register anything. Gating the skeleton on ~150ms of sustained
 * loading is what makes the loading UX honest — you only see it when the
 * data really is arriving slowly.
 */
export const useDelayedTrue = (value: boolean, delayMs = 150): boolean => {
    const [ready, setReady] = useState(false);
    const [lastValue, setLastValue] = useState(value);

    // Reset when `value` transitions — the React-idiomatic way to reset
    // state on a prop change without a synchronous setState in an effect
    // body. See "Storing information from previous renders" in the React
    // docs. Both updates are called during render only when the input
    // actually changed, so React batches them into a single re-render.
    if (value !== lastValue) {
        setLastValue(value);
        setReady(false);
    }

    useEffect(() => {
        if (!value) return;
        const handle = window.setTimeout(() => setReady(true), delayMs);
        return () => window.clearTimeout(handle);
    }, [value, delayMs]);

    return ready;
};
