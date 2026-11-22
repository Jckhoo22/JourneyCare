import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import "./BackLink.css";

import { useLanguage } from "../context/LanguageContext";

interface BackLinkProps {
    /**
     * The parent screen's route. Always a full route path, never
     * `navigate(-1)`: a user arriving via a shared URL or the /join deep
     * link has no history that means anything, and popping it would eject
     * them from the app.
     *
     * `navigate(-1)` also breaks the post-save flow: an Edit page saves
     * with `navigate(carPath, {replace: true})`, landing on Car; the older
     * Car entry sits directly behind the replaced one, so a "smart back"
     * pop from Car lands on Car again — the classic "back does nothing"
     * loop. Explicit `to` is the only shape that survives that.
     */
    to: string;
    /**
     * The parent screen's own name — a group name, a car name, or "Home".
     * `null` while the parent's data is still loading; the fallback then
     * reads "Back" until the name resolves. Do NOT open a second Firestore
     * read to get one: pass what the page already holds.
     */
    label: string | null | undefined;
    /**
     * Optional class override, for pages that need to swap the top-of-page
     * treatment for a centred one (the auth-shell forms).
     */
    className?: string;
}

/**
 * The single back-link used across every detail screen. [Polish item 2]
 *
 * Renders `← {label}` with the destination's own name — a group, a car, or
 * "Home" — rather than a bare arrow, so the target of the tap is obvious
 * before you tap it. Teal accent so it reads as tappable; ≥44px tall via
 * the link's own padding, so nothing about the surrounding layout can
 * shrink the target below the touch minimum.
 *
 * ── Why every back is an explicit `<Link to>` ─────────────────────────────
 * `navigate(-1)` was removed in the nav-loops fix pass. Two shapes of bug
 * came out of it:
 *
 *   1. **Post-save "back does nothing".** Save on the Edit form fires
 *      `navigate(carPath, {replace: true})` and lands on Car. The older
 *      Car entry sits directly behind the replaced one — a pop lands on
 *      the same URL the user is already looking at.
 *   2. **Deep-link eject.** A visitor arriving at a shared URL, a /join
 *      deep link, or a bookmark has no in-app history behind them; a pop
 *      drops them out of the site.
 *
 * The explicit `to` route sidesteps both. Every caller passes the parent's
 * canonical route (`groupPath(id)`, `carPath(...)`, `ROUTES.home`) built
 * from either constants or data already loaded on the page.
 */
const BackLink = ({ to, label, className }: BackLinkProps) => {
    const { locale } = useLanguage();

    const display = label?.trim() || locale.common.back;

    return (
        <Link
            to={to}
            className={className ?? "back-link"}
            aria-label={`${locale.common.back}: ${display}`}
        >
            <ArrowLeft size={16} strokeWidth={2.5} aria-hidden="true" />
            <span className="back-link-label">{display}</span>
        </Link>
    );
};

export default BackLink;
