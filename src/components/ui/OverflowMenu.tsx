import {
    useEffect,
    useId,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { MoreHorizontal } from "lucide-react";
import "./OverflowMenu.css";

/**
 * Compact "⋯" overflow menu. [Parts shelf redesign]
 *
 * One trigger — a 32px icon button — anchored to a small popover of
 * actions. Reusable primitive: expects the caller to supply the actions
 * as its children, so any mix of Edit / Remove / Copy / etc. shows up
 * without a config schema.
 *
 * Behaviour:
 *   - click the trigger to toggle
 *   - click outside the panel to close
 *   - Escape closes and returns focus to the trigger
 *   - a click on any child button closes automatically (via context) —
 *     each action wraps in `OverflowMenuItem` for the wiring
 *
 * Kept intentionally lightweight — no portal, no positioning library. The
 * menu is absolutely positioned relative to a wrapper that the trigger
 * shares, so it sits directly beneath (or above, on cramped viewports)
 * the trigger without extra math. Anywhere it clips awkwardly, wrap it
 * in a `position: relative` parent with enough breathing room.
 */

interface OverflowMenuProps {
    label: string;
    children: ReactNode;
    /** Optional trigger override — default is a 32px ⋯ icon button. */
    trigger?: ReactNode;
}

const OverflowMenu = ({ label, children, trigger }: OverflowMenuProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelId = useId();

    // Click outside → close. Attached only while open, so mounting a
    // hundred rows doesn't attach a hundred permanent listeners.
    useEffect(() => {
        if (!isOpen) return;
        const handleDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                panelRef.current?.contains(target) ||
                triggerRef.current?.contains(target)
            ) {
                return;
            }
            setIsOpen(false);
        };
        window.addEventListener("mousedown", handleDown);
        return () => window.removeEventListener("mousedown", handleDown);
    }, [isOpen]);

    // Escape → close + return focus to the trigger.
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen]);

    // Close the menu after any action fires. Delegated to the panel's
    // click handler so child items don't have to know about it.
    const handlePanelClick = (event: React.MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target.closest("button")) setIsOpen(false);
    };

    return (
        <div className="overflow-menu">
            <button
                ref={triggerRef}
                type="button"
                className="overflow-menu-trigger"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-label={label}
                onClick={() => setIsOpen((current) => !current)}
            >
                {trigger ?? (
                    <MoreHorizontal
                        size={16}
                        strokeWidth={2.25}
                        aria-hidden="true"
                    />
                )}
            </button>

            {isOpen && (
                <div
                    ref={panelRef}
                    id={panelId}
                    role="menu"
                    className="overflow-menu-panel"
                    onClick={handlePanelClick}
                >
                    {children}
                </div>
            )}
        </div>
    );
};

/**
 * One row in the menu. Renders as a full-width button so a click
 * anywhere on the row activates. Destructive variant sets red text and
 * a hover tint.
 */
export const OverflowMenuItem = ({
    onSelect,
    variant = "default",
    children,
}: {
    onSelect: () => void;
    variant?: "default" | "danger";
    children: ReactNode;
}) => (
    <button
        type="button"
        role="menuitem"
        className={`overflow-menu-item overflow-menu-item-${variant}`}
        onClick={onSelect}
    >
        {children}
    </button>
);

export default OverflowMenu;
