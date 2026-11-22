import type { ComponentType, ReactNode } from "react";
import "./EmptyState.css";

/**
 * The one empty-state shape. [UX pass R7]
 *
 * Icon (or short glyph) + one-sentence title + optional body + optional
 * primary action button — everything in the same order on every screen so a
 * user learns the pattern once. Replaces the ad-hoc `.app-empty` +
 * `.home-empty` + `.group-cars-empty` divs the pages were assembling.
 *
 * The primary action lives INSIDE the card (not below it): the eye lands on
 * the message and the finger lands on the fix in one movement — see
 * UX-AUDIT.md CC8.
 */
interface EmptyStateProps {
    /** Lucide icon component, rendered in a small tinted chip above the title. */
    icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
    /** Or a short glyph — usually an emoji. Rendered aria-hidden. */
    glyph?: string;
    title: string;
    /** One-sentence body copy. Optional — the title often carries the message. */
    body?: string;
    /**
     * The primary action for this empty state. A whole ReactNode so the
     * caller can hand in a `<Button>` (this repo's primitive) with its own
     * `to` / `onClick` / label / icon. Kept as a node rather than a shape so
     * this component doesn't have to know about routing.
     */
    action?: ReactNode;
    /** Optional secondary action (a text link, usually) beside the primary. */
    secondaryAction?: ReactNode;
}

const EmptyState = ({
    icon: Icon,
    glyph,
    title,
    body,
    action,
    secondaryAction,
}: EmptyStateProps) => (
    <div className="empty-state app-empty">
        {(Icon || glyph) && (
            <div className="empty-state-glyph" aria-hidden="true">
                {Icon ? <Icon size={28} strokeWidth={2} /> : glyph}
            </div>
        )}
        <h2 className="app-empty-title">{title}</h2>
        {body && <p className="app-empty-body">{body}</p>}
        {(action || secondaryAction) && (
            <div className="empty-state-actions">
                {action}
                {secondaryAction}
            </div>
        )}
    </div>
);

export default EmptyState;
