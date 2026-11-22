import type { ElementType, ReactNode } from "react";
import "./Stack.css";

/**
 * Vertical rhythm primitive. [UX pass R4]
 *
 * Three gap tokens, one per relationship:
 *   `sm`  — related items in the same block  (12px)
 *   `md`  — content inside a card             (16px)
 *   `lg`  — between sections of a screen      (24px on phone, 32px on wide)
 *
 * The `.app-main` container already sets `gap: var(--space-6)` on its direct
 * children, so at the page level you rarely need to reach for this. Where it
 * earns its keep is inside cards and inside long forms — a run of fields
 * that used to squeeze at `--space-2` now uses `gap="sm"` and gets 12px
 * consistently.
 *
 * Rendered as a `<div>` by default; pass `as="section"` / `"form"` etc. for
 * semantically-correct wrappers.
 */

type Gap = "sm" | "md" | "lg";

interface StackProps {
    children: ReactNode;
    gap?: Gap;
    as?: ElementType;
    className?: string;
}

const Stack = ({ children, gap = "md", as = "div", className }: StackProps) => {
    const Component = as;
    const classes = ["stack", `stack-${gap}`, className].filter(Boolean).join(" ");
    return <Component className={classes}>{children}</Component>;
};

export default Stack;
