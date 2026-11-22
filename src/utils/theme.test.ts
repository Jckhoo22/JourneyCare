import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_THEME, applyTheme, resolveTheme } from "./theme";

const setSearch = (search: string) => {
    Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, search },
    });
};

describe("resolveTheme", () => {
    it("prefers an explicit request over a remembered one", () => {
        expect(resolveTheme("mono", "teal")).toBe("mono");
        expect(resolveTheme("teal", "mono")).toBe("teal");
    });

    it("falls back to what was remembered", () => {
        expect(resolveTheme(null, "mono")).toBe("mono");
    });

    it("falls back to the default when neither is set", () => {
        expect(resolveTheme(null, null)).toBe(DEFAULT_THEME);
    });

    // A stale link or a hand-edited storage value must not leave the app with
    // no accent set at all.
    it("ignores a name it doesn't recognise", () => {
        expect(resolveTheme("neon", null)).toBe(DEFAULT_THEME);
        expect(resolveTheme(null, "neon")).toBe(DEFAULT_THEME);
    });
});

describe("applyTheme", () => {
    afterEach(() => {
        window.localStorage.clear();
        delete document.documentElement.dataset.theme;
        setSearch("");
    });

    it("stamps the non-default theme onto <html>", () => {
        setSearch("?theme=mono");
        expect(applyTheme()).toBe("mono");
        expect(document.documentElement.dataset.theme).toBe("mono");
    });

    // The default IS :root, so writing an attribute for it would imply an
    // override that doesn't exist.
    it("writes no attribute for the default", () => {
        setSearch("?theme=teal");
        expect(applyTheme()).toBe("teal");
        expect(document.documentElement.dataset.theme).toBeUndefined();
    });

    it("remembers an explicit choice across a visit with no query string", () => {
        setSearch("?theme=mono");
        applyTheme();

        setSearch("");
        expect(applyTheme()).toBe("mono");
        expect(document.documentElement.dataset.theme).toBe("mono");
    });

    it("lets an explicit choice switch back", () => {
        setSearch("?theme=mono");
        applyTheme();

        setSearch("?theme=teal");
        expect(applyTheme()).toBe("teal");
        expect(document.documentElement.dataset.theme).toBeUndefined();
    });

    it("does not remember a name it didn't recognise", () => {
        setSearch("?theme=neon");
        expect(applyTheme()).toBe(DEFAULT_THEME);
        expect(window.localStorage.getItem("jc-theme")).toBeNull();
    });
});
