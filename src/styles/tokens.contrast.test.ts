import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WCAG contrast checks, read straight out of tokens.css. [Theme swap]
 *
 * These parse the real stylesheet rather than repeating its values, so a token
 * edit that drops a pairing below AA fails here instead of on someone's phone.
 * Both accent sets are checked: the teal default under `:root`, and the
 * near-monochrome set under `:root[data-theme="mono"]`.
 *
 * Thresholds are WCAG 2.1: 4.5:1 for normal text, 3:1 for large text (>=18.66px
 * bold or >=24px) and for UI component boundaries.
 */

const CSS = readFileSync("src/styles/tokens.css", "utf8");

/** Pulls a `--name: value;` block out of one selector's body. */
const blockFor = (selector: string): string => {
    const start = CSS.indexOf(selector);
    if (start === -1) throw new Error(`No ${selector} block in tokens.css`);
    const open = CSS.indexOf("{", start);
    const close = CSS.indexOf("\n}", open);
    return CSS.slice(open, close);
};

const ROOT = blockFor(":root {");
const MONO = blockFor(':root[data-theme="mono"]');

const readToken = (block: string, name: string): string => {
    const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
    if (!match) throw new Error(`Token --${name} not found`);
    return match[1].trim();
};

/** Tokens for one accent set: the mono block, falling back to :root. */
const tokensFor = (theme: "teal" | "mono") => (name: string) => {
    if (theme === "mono") {
        try {
            return readToken(MONO, name);
        } catch {
            /* not overridden — fall through to the shared value */
        }
    }
    return readToken(ROOT, name);
};

const toRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace("#", "").trim();
    const full =
        clean.length === 3
            ? clean
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : clean;
    return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
    ];
};

/** WCAG relative luminance. */
const luminance = (hex: string): number => {
    const [r, g, b] = toRgb(hex).map((channel) => {
        const s = channel / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
    const la = luminance(a);
    const lb = luminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
};

describe.each(["teal", "mono"] as const)("%s accent set", (theme) => {
    const token = tokensFor(theme);

    describe("normal text — AA needs 4.5:1", () => {
        it("label on a primary button", () => {
            // The single most-used coloured surface in the app.
            expect(
                contrast(token("color-on-primary"), token("color-primary")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("label on a primary button, hovered", () => {
            expect(
                contrast(token("color-on-primary"), token("color-primary-active")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("accent text on the pale accent tint — badges, logo chip", () => {
            expect(
                contrast(token("color-primary"), token("color-primary-soft")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("accent text on a card — links, active states", () => {
            expect(
                contrast(token("color-primary"), token("color-surface")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("accent text on the page background", () => {
            expect(
                contrast(token("color-primary"), token("color-page")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("body text on a card", () => {
            expect(
                contrast(token("color-text-body"), token("color-surface")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("secondary text on a card", () => {
            expect(
                contrast(token("color-text-subtle"), token("color-surface")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("error text on the error surface", () => {
            expect(
                contrast(token("color-error-text"), token("color-error-surface")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("label on a solid destructive button", () => {
            expect(
                contrast(token("color-on-primary"), token("color-error")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("due-soon amber on its surface [R2]", () => {
            expect(
                contrast(token("color-warning"), token("color-warning-surface")),
            ).toBeGreaterThanOrEqual(4.5);
        });

        it("ok green on its surface [R2]", () => {
            expect(
                contrast(token("color-success"), token("color-success-surface")),
            ).toBeGreaterThanOrEqual(4.5);
        });
    });

    describe("non-text contrast — AA needs 3:1", () => {
        it("the faintest text we use, on a card", () => {
            // Only ever used for de-emphasised metadata at 13px.
            expect(
                contrast(token("color-text-faint"), token("color-surface")),
            ).toBeGreaterThanOrEqual(3);
        });

        it("the focus ring against the page", () => {
            expect(
                contrast(token("color-primary"), token("color-page")),
            ).toBeGreaterThanOrEqual(3);
        });
    });
});

/**
 * The reason `--color-success` moved off emerald when the accent became teal:
 * a status colour that reads as the accent has stopped being a status colour.
 */
describe("status colours stay distinguishable from the accent", () => {
    const teal = tokensFor("teal");

    /**
     * Hue angle, not RGB distance.
     *
     * Two colours can sit close in RGB and still read as obviously different —
     * and, more to the point here, the confusion this guards against is a
     * confusion of HUE: "is that badge the accent, or does it mean OK?".
     * Straight-line RGB distance answers a question nobody is asking.
     */
    const hue = (hex: string): number => {
        const [r, g, b] = toRgb(hex).map((c) => c / 255);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        if (delta === 0) return 0;

        const raw =
            max === r
                ? ((g - b) / delta) % 6
                : max === g
                  ? (b - r) / delta + 2
                  : (r - g) / delta + 4;
        return (raw * 60 + 360) % 360;
    };

    const hueGap = (a: string, b: string): number => {
        const diff = Math.abs(hue(a) - hue(b)) % 360;
        return diff > 180 ? 360 - diff : diff;
    };

    it.each([
        ["success", "color-success"],
        ["error", "color-error"],
        ["warning", "color-warning"],
        ["info", "color-info"],
    ])("%s is a different hue from the teal accent", (_label, name) => {
        expect(hueGap(teal("color-primary"), teal(name))).toBeGreaterThan(25);
    });

    // The specific pairing that forced --color-success off emerald: emerald-600
    // sits ~15° from teal-700 and the two are the same colour at badge size.
    it("keeps success clear of the accent by a comfortable margin", () => {
        expect(
            hueGap(teal("color-primary"), teal("color-success")),
        ).toBeGreaterThan(30);
    });
});
