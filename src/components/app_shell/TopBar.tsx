import { Link } from "react-router";
import { Car, Bell } from "lucide-react";
import "./TopBar.css";

import AccountMenu from "./AccountMenu";
import { useLanguage } from "../../context/LanguageContext";
import { useUnreadNotifications } from "../../controller/NotificationsController";
import { formatUnreadBadge } from "../../model/Notification";
import { ROUTES } from "../../constants/routes";

interface TopBarProps {
    onSignOut: () => void;
}

/**
 * Signed-in top bar: the Journey Care mark and name, the notification bell with
 * its live unread badge, and the account menu. [H1, N2]
 *
 * Sign-out used to be a bare button right here, next to the bell, and people
 * kept hitting it by accident. It lives inside AccountMenu now — see that
 * component for why a confirmation on the same button wasn't the answer.
 */
const TopBar = ({ onSignOut }: TopBarProps) => {
    const { locale } = useLanguage();
    const { count } = useUnreadNotifications();

    const bellLabel =
        count > 0
            ? locale.notifications.bellWithCount.replace(
                  "{count}",
                  formatUnreadBadge(count),
              )
            : locale.notifications.bellLabel;

    return (
        <header className="top-bar">
            {/* Logo AND name in one link — no dead gap between them where a
                tap does nothing. Goes straight to home; no confirmation even
                from form pages, per the polish item's spec. [Polish item 1] */}
            <Link
                to={ROUTES.home}
                className="top-bar-brand"
                aria-label={locale.common.homeLinkAria}
            >
                {/* Same mark as the auth card's icon-box, scaled down. */}
                <span className="top-bar-logo">
                    <Car size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="top-bar-name">{locale.appName}</span>
            </Link>

            <div className="top-bar-actions">
                <Link
                    to={ROUTES.notifications}
                    className="top-bar-icon-btn"
                    aria-label={bellLabel}
                >
                    <Bell size={20} strokeWidth={2} />
                    {count > 0 && (
                        <span className="top-bar-badge">
                            {formatUnreadBadge(count)}
                        </span>
                    )}
                </Link>

                <AccountMenu onSignOut={onSignOut} />
            </div>
        </header>
    );
};

export default TopBar;
