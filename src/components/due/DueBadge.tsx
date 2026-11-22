import { AlertTriangle, CircleAlert } from "lucide-react";
import "./DueBadge.css";

import { useLanguage } from "../../context/LanguageContext";
import { statusClass, statusLabel } from "../../model/Due";
import type { DueStatus } from "../../lib/nextDue";

interface DueBadgeProps {
    status: DueStatus;
    /** How many items are in this state, when it's a summary. */
    count?: number;
}

/**
 * A car's worst next-due status. [C10, R3]
 *
 * Renders nothing at OK — a badge saying "fine" on every card is noise, and
 * the point of the badge is that it draws the eye only when something wants
 * doing.
 *
 * Coloured from the STATUS tokens (amber, red), never the accent: a reminder
 * that reads as branding has stopped being a reminder. See CONTEXT.md §
 * Two accent sets.
 */
const DueBadge = ({ status, count }: DueBadgeProps) => {
    const { locale } = useLanguage();

    if (status === "OK") return null;

    const Icon = status === "OVERDUE" ? CircleAlert : AlertTriangle;

    return (
        <span className={`due-badge ${statusClass(status)}`}>
            <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
            <span>
                {count !== undefined && count > 1
                    ? `${count} ${statusLabel(status, locale).toLowerCase()}`
                    : statusLabel(status, locale)}
            </span>
        </span>
    );
};

export default DueBadge;
