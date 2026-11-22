import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches, as React state.
 *
 * For the rare case where a layout decision can't be made in CSS because the
 * two layouts are *different markup* — the access grid's table versus its
 * accordion, where one has column headers and the other has disclosure buttons.
 * Rendering both and hiding one with CSS would double the toggles in the
 * accessibility tree and give every switch a duplicate.
 *
 * Anything expressible as a CSS breakpoint should stay in CSS.
 *
 * Built on `useSyncExternalStore` rather than useState + useEffect: matchMedia
 * IS an external store, and the hook exists precisely so subscribing to one
 * doesn't need a setState in an effect (which cascades a render, and can miss
 * a change that lands between render and subscribe).
 */
export const useMediaQuery = (query: string): boolean => {
    const subscribe = useCallback(
        (onChange: () => void) => {
            if (typeof window === "undefined" || !window.matchMedia) {
                return () => {};
            }
            const list = window.matchMedia(query);
            list.addEventListener("change", onChange);
            return () => list.removeEventListener("change", onChange);
        },
        [query],
    );

    const getSnapshot = useCallback(() => {
        if (typeof window === "undefined" || !window.matchMedia) return false;
        return window.matchMedia(query).matches;
    }, [query]);

    // The server snapshot is `false`: the narrow layout works everywhere, so
    // it's the safe thing to render before a viewport is known.
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
};
