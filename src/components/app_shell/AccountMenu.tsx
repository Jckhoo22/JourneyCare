import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import "./AccountMenu.css";

import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { ROUTES } from "../../constants/routes";

interface AccountMenuProps {
    onSignOut: () => void;
}

/** First letter of the display name, for the avatar. Falls back to the mark. */
const initialOf = (name: string): string =>
    name.trim().charAt(0).toUpperCase() || "?";

/**
 * The account button and its menu.
 *
 * This replaced a bare one-tap Sign out button that sat 8px from the
 * notification bell. A thumb aimed at the bell landed on it often enough to be
 * a real complaint, and signing out is not something you want to happen by
 * accident — it's a full re-authentication to undo.
 *
 * The fix isn't a confirmation dialog on the same button; it's that the
 * top-level tap in that corner no longer DOES anything destructive. A mis-tap
 * now opens a menu, which costs a glance and a second tap to dismiss. Sign out
 * is never the first tap.
 */
const AccountMenu = ({ onSignOut }: AccountMenuProps) => {
    const { locale } = useLanguage();
    const { user } = useUser();

    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const name = user?.username || user?.nickname || "";

    // Dismiss on an outside tap or Escape. Both listeners are only attached
    // while the menu is actually open.
    useEffect(() => {
        if (!isOpen) return;

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setIsOpen(false);
            // Escape should leave focus somewhere sensible, not on nothing.
            buttonRef.current?.focus();
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [isOpen]);

    return (
        <div className="account" ref={wrapperRef}>
            <button
                ref={buttonRef}
                type="button"
                className="account-btn"
                onClick={() => setIsOpen((open) => !open)}
                aria-label={locale.account.menuLabel}
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
                <span className="account-avatar" aria-hidden="true">
                    {initialOf(name)}
                </span>
            </button>

            {isOpen && (
                <div className="account-menu" role="menu">
                    <div className="account-who">
                        <span className="account-who-label">
                            {locale.account.signedInAs}
                        </span>
                        {name && <span className="account-who-name">{name}</span>}
                        {user?.email && (
                            <span className="account-who-email">{user.email}</span>
                        )}
                    </div>

                    {/* SET1: Settings is reached from here rather than getting
                        its own top-bar icon. This menu is already the "about
                        me" corner of the app — the name and email sit two
                        lines above — and a fourth icon in a 44px-tall bar on a
                        375px screen is how the bell got mis-tapped in the
                        first place. */}
                    <Link
                        to={ROUTES.settings}
                        role="menuitem"
                        className="account-item"
                        onClick={() => setIsOpen(false)}
                    >
                        <SettingsIcon size={16} strokeWidth={2} />
                        <span>{locale.account.settings}</span>
                    </Link>

                    <button
                        type="button"
                        role="menuitem"
                        className="account-item account-signout"
                        onClick={() => {
                            setIsOpen(false);
                            onSignOut();
                        }}
                    >
                        <LogOut size={16} strokeWidth={2} />
                        <span>{locale.home.signOut}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default AccountMenu;
