/**
 * Which accent set the app is wearing.
 *
 * Both sets live in `src/styles/tokens.css`; this only decides which one is
 * active, by stamping `data-theme` on `<html>`. There is no per-screen work
 * and no build flag — the whole point is that one deployed build can show both,
 * so they can be compared on a real phone before either is committed to.
 *
 *     https://…/            deep teal (default)
 *     https://…/?theme=mono near-monochrome
 *     https://…/?theme=teal back to the default
 *
 * The choice sticks in localStorage, so it survives navigation within the app
 * and a reload without the query string. Clearing site data resets it.
 */

export type ThemeName = "teal" | "mono";

const THEMES: ThemeName[] = ["teal", "mono"];
const STORAGE_KEY = "jc-theme";

/** The default. `teal` writes no attribute — it IS `:root`. */
export const DEFAULT_THEME: ThemeName = "teal";

const isThemeName = (value: string | null): value is ThemeName =>
    value !== null && (THEMES as string[]).includes(value);

/**
 * Resolves the theme from an explicit request, then a remembered one, then the
 * default. Pure, so the precedence is testable without touching the DOM.
 */
export const resolveTheme = (
    requested: string | null,
    remembered: string | null,
): ThemeName => {
    if (isThemeName(requested)) return requested;
    if (isThemeName(remembered)) return remembered;
    return DEFAULT_THEME;
};

/**
 * Reads the URL and storage, applies the result, and remembers an explicit
 * request. Call once, before the first render — a theme that lands after paint
 * is a visible flash of the wrong colours.
 *
 * Deliberately forgiving: a Safari private window throws on localStorage, and
 * a broken colour preference must never be the thing that stops the app
 * booting.
 */
export const applyTheme = (): ThemeName => {
    if (typeof document === "undefined") return DEFAULT_THEME;

    let requested: string | null = null;
    let remembered: string | null = null;

    try {
        requested = new URLSearchParams(window.location.search).get("theme");
        remembered = window.localStorage.getItem(STORAGE_KEY);
    } catch {
        // Storage unavailable — fall through to the default.
    }

    const theme = resolveTheme(requested, remembered);

    // `teal` is what :root already declares, so it needs no attribute; leaving
    // it off keeps the DOM honest about which set is the baseline.
    if (theme === DEFAULT_THEME) {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = theme;
    }

    if (isThemeName(requested)) {
        try {
            window.localStorage.setItem(STORAGE_KEY, requested);
        } catch {
            // Not being able to remember the choice is not worth failing over.
        }
    }

    return theme;
};
