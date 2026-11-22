import type { ReactNode } from "react";

/**
 * Small uppercase eyebrow above a section. [UX pass R5]
 *
 * Wraps `.app-eyebrow` so callers stop reaching for a raw `<h2>` with the
 * class hand-attached. Renders as an h2 by default (a screen section is
 * an outline level); pass `as="span"` for the panel-title-inline case.
 */
interface SectionLabelProps {
    children: ReactNode;
    as?: "h2" | "h3" | "span";
    id?: string;
}

const SectionLabel = ({ children, as = "h2", id }: SectionLabelProps) => {
    const Component = as;
    return (
        <Component id={id} className="app-eyebrow">
            {children}
        </Component>
    );
};

export default SectionLabel;
