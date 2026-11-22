import type { ComponentType, ReactNode } from "react";
import "../../styles/auth-shell.css";
import "./CardShell.css";

import BackLink from "../BackLink";

interface CardShellBackLink {
    /** Full route to the parent screen — same contract as `<BackLink>`. */
    to: string;
    /**
     * The parent screen's own name. See `<BackLink>` for why this is a plain
     * string rather than an inferred label.
     */
    label: string;
}

interface CardShellProps {
    /**
     * Icon rendered inside the small tinted chip at the top of the card.
     * Convention: 30px Lucide icon, deliberately device-neutral where the
     * page reads on both phone and desktop.
     */
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    /** The page title — becomes the `<h1>` inside the card. */
    title: string;
    /** Support line under the title. Omitted when the title alone tells the story. */
    subtitle?: string;
    /**
     * Optional back link, rendered INSIDE the centred content column,
     * left-aligned to the card's edge, ~12px above the card. NEVER at the
     * viewport corner — headerless card screens have no header, so
     * "top-left under header" is undefined, and the viewport corner would
     * orphan the link away from what it's returning from.
     * [CardShell BackLink addendum, 2026-07-28.]
     *
     * Screens with no sensible back target (LoginRegister — it IS the
     * entry door — plus VerifyEmail and ChooseUsername, where "sign out"
     * is the escape) omit this. On JoinGroup, the /join deep-link door,
     * the prop is set only for signed-in visitors; a fresh signed-out
     * arrival from WhatsApp gets a card-only render because "Home" for
     * them is the auth gate.
     */
    backLink?: CardShellBackLink;
    /** Content of the card: form, buttons, quiet footer links. */
    children: ReactNode;
}

/**
 * The shared centered-card page shell. [Shell polish]
 *
 * Renders: full-height container + decorative blobs + optional page-level
 * BackLink at top-left + a centered white card with icon-header, title,
 * optional subtitle, and a content slot. The card carries only icon → title
 * → subtitle → content; navigation is a sibling of the card, not a footer
 * link inside it.
 *
 * ── Why one component ──────────────────────────────────────────────────────
 * Before this, nine screens each carried the same twenty-line block of
 * `.app-container` + blobs + `.auth-card` + `.icon-header` + `.text-header`.
 * When the card gained desktop-specific proportions or moved its back link
 * out of the footer,
 * each screen had to reproduce the change — and JoinWithCode drifted first.
 * This one component owns the shape so a single change lands everywhere.
 *
 * ── Style scopes ───────────────────────────────────────────────────────────
 * Descendants of `.card-shell-content` get the sentence-case label
 * treatment (see CardShell.css) — the AuthTextField default is UPPERCASE
 * for auth-shell fields, and shell screens want plain sentence-case labels.
 * The scope keeps non-shell AuthTextField callers unaffected.
 */
const CardShell = ({
    icon: Icon,
    title,
    subtitle,
    backLink,
    children,
}: CardShellProps) => {
    return (
        <div className="app-container">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            {/* One centred column that carries BOTH the (optional) back
                link and the card, so the back link left-aligns to the
                card's edge instead of the viewport corner. See the prop
                docs above for the addendum this implements. */}
            <div className="card-shell-column">
                {backLink && (
                    <div className="card-shell-back">
                        <BackLink to={backLink.to} label={backLink.label} />
                    </div>
                )}

                <div className="auth-card">
                    <div className="icon-header">
                        <div className="icon-box">
                            <Icon size={30} strokeWidth={2} />
                        </div>
                    </div>

                    <div className="text-header">
                        <h1 className="title">{title}</h1>
                        {subtitle && <p className="subtitle">{subtitle}</p>}
                    </div>

                    <div className="card-shell-content">{children}</div>
                </div>
            </div>
        </div>
    );
};

export default CardShell;
