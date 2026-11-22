import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Layout invariants, read straight out of the real stylesheets.
 *
 * Two bugs motivated this file, and both were invisible in review because the
 * offending declaration looked completely ordinary on its own line:
 *
 *   1. `overflow-x: hidden` on a page shell. It reads as "don't scroll
 *      sideways", but it also forces the OTHER axis from `visible` to `auto`,
 *      which quietly turns the element into a second scroll container nested
 *      inside the document's. With `.blob-bottom` hanging 12% of the page's
 *      height past the bottom edge, that container had something to scroll,
 *      and the page moved in two disconnected halves.
 *
 *   2. A sub-16px font-size on an input. iOS Safari force-zooms the viewport
 *      on focus and never zooms back out.
 *
 * Neither is caught by a render test — you need the computed cascade or a real
 * phone. Parsing the stylesheets is the cheap middle ground.
 */

const STYLES = "src/styles";

const cssFilesIn = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return cssFilesIn(path);
        return entry.name.endsWith(".css") ? [path] : [];
    });

const ALL_CSS = cssFilesIn("src").map((path) => ({
    path,
    text: readFileSync(path, "utf8"),
}));

/** Every `selector { … }` rule in a stylesheet, comments stripped. */
const rulesIn = (text: string): Array<{ selector: string; body: string }> => {
    const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules: Array<{ selector: string; body: string }> = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(withoutComments)) !== null) {
        // Anything before the last `;` is a preceding at-rule (`@import …;`),
        // not part of this rule's selector.
        const selector = match[1].split(";").pop()!.trim();
        rules.push({ selector, body: match[2] });
    }
    return rules;
};

describe("one scroll context per page", () => {
    /**
     * The page shells. These are the elements that wrap a whole screen and sit
     * directly inside `<body>`, so they are the ones where an accidental
     * scroll container costs the user a broken page rather than a clipped
     * corner.
     */
    const SHELLS = [
        { file: `${STYLES}/app-shell.css`, selector: ".app-page" },
        { file: `${STYLES}/auth-shell.css`, selector: ".app-container" },
    ];

    for (const shell of SHELLS) {
        it(`${shell.selector} clips sideways without becoming a scroll container`, () => {
            const text = readFileSync(shell.file, "utf8");
            const rule = rulesIn(text).find((r) => r.selector === shell.selector);
            expect(rule, `${shell.selector} not found in ${shell.file}`).toBeDefined();

            const declarations = rule!.body
                .split(";")
                .map((d) => d.trim())
                .filter(Boolean);

            // The LAST overflow-x declaration is the one that wins. `hidden`
            // may appear before it as the pre-Safari-16 fallback.
            const overflowX = declarations
                .filter((d) => d.startsWith("overflow-x:"))
                .pop();

            expect(overflowX, `${shell.selector} should state overflow-x`).toBeDefined();
            expect(
                overflowX,
                `${shell.selector} must use 'clip', not 'hidden' — 'hidden' ` +
                    "forces overflow-y to auto and nests a second scroll " +
                    "container inside the document's",
            ).toBe("overflow-x: clip");

            // A page shell that scrolls its own y axis is the same bug from
            // the other direction.
            expect(
                declarations.some((d) => /^overflow-y:\s*(auto|scroll)/.test(d)),
                `${shell.selector} must not scroll its own y axis`,
            ).toBe(false);
        });
    }

    it("no component stylesheet opens a y-axis scroll container", () => {
        /**
         * Allowlist — surfaces that legitimately scroll independently of the
         * page. Each entry lists the file and selector together, and states
         * why it earns the exception. The rule stays "deliberately zero" for
         * everything else; a new entry here needs an argument attached, not
         * just a passing test.
         *
         *   .app-modal-body    A modal is portaled outside the page shell and
         *                      shows a form in a bounded sheet — a taller form
         *                      than the sheet has to reach the fields via a
         *                      scrollable body. Not a page scroll container.
         *   .combo-list        Combobox dropdown listbox (see ComboField). The
         *                      list can hold ~200 brand entries; it's a floating
         *                      layer over the page, not nested inside it.
         */
        const ALLOW = new Set([
            "src\\components\\ui\\Modal.css — .app-modal-body",
            "src\\components\\form\\ComboField.css — .combo-list",
            // Same paths on POSIX for cross-platform runs.
            "src/components/ui/Modal.css — .app-modal-body",
            "src/components/form/ComboField.css — .combo-list",
        ]);

        const offenders = ALL_CSS.flatMap(({ path, text }) =>
            rulesIn(text)
                .filter((rule) =>
                    rule.body
                        .split(";")
                        .some((d) =>
                            /^\s*overflow(-y)?:\s*(auto|scroll)/.test(d),
                        ),
                )
                .map((rule) => `${path} — ${rule.selector}`)
                .filter((entry) => !ALLOW.has(entry)),
        );

        expect(offenders).toEqual([]);
    });

    it("uses dvh alongside any viewport-height rule", () => {
        // 100vh on iOS measures the viewport as if the URL bar weren't there,
        // so a full-height shell is always taller than the screen.
        const offenders = ALL_CSS.flatMap(({ path, text }) =>
            rulesIn(text)
                .filter((rule) => {
                    const usesVh = /\d+vh\b/.test(rule.body);
                    const usesDvh = /\d+dvh\b/.test(rule.body);
                    return usesVh && !usesDvh;
                })
                .map((rule) => `${path} — ${rule.selector}`),
        );

        expect(offenders).toEqual([]);
    });
});

describe("iOS does not zoom a focused field", () => {
    /**
     * Anything typed into must render at 16px or more. Below that, focusing it
     * on iOS Safari zooms the viewport in and leaves it there.
     *
     * The floor is set once in index.css on the bare element selectors. What
     * this test guards is the other half: no component stylesheet may set a
     * SMALLER size on a control, which would win on specificity.
     */
    const SIZES: Record<string, number> = {
        "--text-display": 24,
        "--text-title": 18,
        "--text-body": 16,
        "--text-sm": 15,
        "--text-xs": 13,
        "--text-label": 12,
    };

    it("index.css states the 16px floor on inputs", () => {
        const text = readFileSync("src/index.css", "utf8");
        const rule = rulesIn(text).find(
            (r) => r.selector.replace(/\s+/g, " ") === "input, select, textarea",
        );

        expect(rule, "no bare input/select/textarea rule in index.css").toBeDefined();
        expect(rule!.body).toMatch(/font-size:\s*max\(.*16px\)/);
    });

    it("no control is styled below 16px anywhere", () => {
        const offenders: string[] = [];

        for (const { path, text } of ALL_CSS) {
            for (const rule of rulesIn(text)) {
                // Only rules that actually target a control. Class names ending
                // in -input / -control / -field are this app's convention for
                // one, alongside the bare element selectors.
                const targetsControl =
                    /\b(input|select|textarea)\b/.test(rule.selector) ||
                    /(-input|-control|-field)\b/.test(rule.selector);
                if (!targetsControl) continue;
                // Labels and error text sit in the same block but are not typed
                // into.
                if (/-label\b|-error\b|-hint\b/.test(rule.selector)) continue;

                const match = /font-size:\s*([^;]+)/.exec(rule.body);
                if (!match) continue;

                const value = match[1].trim();
                if (value.startsWith("max(")) continue; // already floored

                const token = /var\((--[\w-]+)\)/.exec(value);
                const px = token
                    ? SIZES[token[1]]
                    : /^([\d.]+)px$/.test(value)
                      ? Number(/^([\d.]+)px$/.exec(value)![1])
                      : /^([\d.]+)rem$/.test(value)
                        ? Number(/^([\d.]+)rem$/.exec(value)![1]) * 16
                        : undefined;

                if (px !== undefined && px < 16) {
                    offenders.push(`${path} — ${rule.selector} (${value} = ${px}px)`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });
});
