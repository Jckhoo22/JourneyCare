import {
    useEffect,
    useId,
    useRef,
    useState,
    type FocusEvent,
} from "react";
import { Check, LogOut } from "lucide-react";
import "../../styles/app-shell.css";
import "./Settings.css";

import TopBar from "../../components/app_shell/TopBar";
import BackLink from "../../components/BackLink";
import LanguageSelect from "../../components/app_shell/LanguageSelect";
import { Button } from "../../components/ui";
import { useAuthController } from "../../controller/AuthController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { USERNAME_MAX_LENGTH } from "../../constants/regex";
import { ROUTES } from "../../constants/routes";
import { APP_VERSION } from "../../constants/version";

/**
 * Settings. [SET1, SET2, D2]
 *
 * Three sections, one card: Profile (display name), Account (email +
 * helper), Preferences (language). Section labels are muted eyebrows,
 * hairlines between sections. The trio maps 1-1 to "who I am / how I
 * sign in / how the app talks to me".
 *
 * ── Auto-save on blur ────────────────────────────────────────────────
 * The display name saves the moment the user leaves the field. No
 * Save/Cancel buttons visible in the resting state — a form that
 * doesn't ask for anything shouldn't LOOK like it's asking.
 *
 * The blur handler only saves when: the value differs from the profile,
 * AND the trimmed value is non-empty. An untouched blur is a no-op, and
 * an intentional empty blur reverts to the current name (never writes
 * an empty username — the profile document rules would refuse it, but
 * the rules-denied error is a poor teacher).
 *
 * On success a brief inline "Saved ✓" appears next to the label and
 * fades after ~2s (existing `settings-saved` element). On validation
 * failure focus returns to the field and an inline red message
 * explains — same red used for other error states on the form; no other
 * page element uses red so the pattern reads unambiguously.
 *
 * The write shape is identical to the previous Save-button path — same
 * `renameUsername` from the AuthController, same rules branch, same
 * fan-out to group members[uid].username via `renameUser`.
 *
 * ── Sign out ────────────────────────────────────────────────────────
 * Ghost variant: hairline gray border, red foreground on the icon and
 * label, no red fill or border. The button is the ONLY red on the page.
 */
const Settings = () => {
    const { locale } = useLanguage();
    const { user } = useUser();
    const { renameUsername, logout, isLoading, errors, clearError } =
        useAuthController();

    const [draft, setDraft] = useState<string | null>(null);
    const name = draft ?? user?.username ?? "";
    const nameError = errors.username;

    /**
     * Fade-in-then-out "Saved ✓" pill next to the label. A timestamp
     * (not a boolean) so a second save within the 2s window restarts
     * the fade cleanly.
     */
    const [savedAt, setSavedAt] = useState<number | null>(null);
    useEffect(() => {
        if (savedAt === null) return;
        const timer = setTimeout(() => setSavedAt(null), 2000);
        return () => clearTimeout(timer);
    }, [savedAt]);
    const isSaved = savedAt !== null;

    const nameId = useId();
    const helperId = `${nameId}-helper`;
    const nameRef = useRef<HTMLInputElement>(null);

    /** True while a save is in flight for this specific field. */
    const [isSavingName, setIsSavingName] = useState(false);

    /**
     * Blur handler for the display-name input.
     *
     * The auto-save contract:
     *   1. Not dirty → no-op.
     *   2. Trim to empty → revert draft (never write empty).
     *   3. Otherwise → fire `renameUsername`. On success, show inline
     *      "Saved ✓" and clear the draft. On failure, restore focus.
     *
     * We block the effect on `isSavingName` so a rapid blur→refocus→
     * blur can't fire two concurrent writes.
     */
    const handleNameBlur = async (_event: FocusEvent<HTMLInputElement>) => {
        if (isSavingName) return;
        const trimmed = name.trim();
        if (trimmed === (user?.username ?? "")) return;

        if (!trimmed) {
            // Never write empty. Silently revert.
            setDraft(null);
            clearError("username");
            return;
        }

        setIsSavingName(true);
        try {
            const saved = await renameUsername(trimmed);
            if (saved) {
                setDraft(null);
                setSavedAt(Date.now());
            } else {
                // Validation failed. Put the user back in the field so
                // they can fix the value without hunting for it. The
                // AuthController set errors.username to the reason; the
                // inline helper below renders it.
                nameRef.current?.focus();
            }
        } finally {
            setIsSavingName(false);
        }
    };

    return (
        <div className="app-page">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <main className="app-main">
                <TopBar onSignOut={logout} />

                <BackLink to={ROUTES.home} label={locale.common.home} />

                <h1 className="app-h1">{locale.settings.title}</h1>

                <section className="app-panel settings-card">
                    {/* ── Section 1: PROFILE ─────────────────────────── */}
                    <p className="settings-section-label">
                        {locale.settings.sectionProfile}
                    </p>
                    <div className="settings-field">
                        <div className="settings-field-head">
                            <label
                                className="settings-field-label"
                                htmlFor={nameId}
                            >
                                {locale.settings.nameLabel}
                            </label>
                            {isSaved && (
                                <span
                                    className="settings-saved"
                                    role="status"
                                >
                                    <Check
                                        size={12}
                                        strokeWidth={3}
                                        aria-hidden="true"
                                    />
                                    <span>
                                        {locale.settings.nameSavedInline}
                                    </span>
                                </span>
                            )}
                        </div>
                        <input
                            id={nameId}
                            ref={nameRef}
                            type="text"
                            className={`settings-input${
                                nameError ? " has-error" : ""
                            }`}
                            placeholder={locale.settings.namePlaceholder}
                            value={name}
                            onChange={(event) => {
                                setDraft(event.target.value);
                                clearError("username");
                            }}
                            onBlur={handleNameBlur}
                            onKeyDown={(event) => {
                                // Enter blurs the field so the auto-save
                                // handler runs — same commit the user
                                // would get by tapping away. No <form>
                                // wraps this input, so the browser wouldn't
                                // submit on its own.
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.currentTarget.blur();
                                }
                            }}
                            maxLength={USERNAME_MAX_LENGTH}
                            disabled={isLoading || isSavingName}
                            aria-invalid={nameError ? true : undefined}
                            aria-describedby={helperId}
                        />
                        {nameError && (
                            <p
                                id={helperId}
                                className="settings-helper settings-helper-error"
                                role="alert"
                            >
                                {nameError}
                            </p>
                        )}
                    </div>

                    <hr className="settings-divider" aria-hidden="true" />

                    {/* ── Section 2: ACCOUNT ─────────────────────────── */}
                    <p className="settings-section-label">
                        {locale.settings.sectionAccount}
                    </p>
                    <div className="settings-field">
                        <div className="settings-field-head">
                            <span className="settings-field-label">
                                {locale.settings.emailLabel}
                            </span>
                        </div>
                        <p className="settings-value">{user?.email}</p>
                        <p className="settings-helper">
                            {locale.settings.emailHint}
                        </p>
                    </div>

                    <hr className="settings-divider" aria-hidden="true" />

                    {/* ── Section 3: PREFERENCES ─────────────────────── */}
                    <p className="settings-section-label">
                        {locale.settings.sectionPreferences}
                    </p>
                    <LanguageSelect
                        id="settings-language"
                        label={locale.settings.languageLabel}
                        hint={locale.settings.languageHint}
                        disabled={isLoading}
                    />
                </section>

                <div className="app-actions">
                    {/* Ghost sign-out: hairline gray border, red foreground.
                        The only red on the page — clearly recognisable, but
                        no danger fill so the resting page reads calm. */}
                    <Button
                        variant="secondary"
                        icon={LogOut}
                        onClick={logout}
                        label={locale.settings.signOut}
                        className="settings-signout"
                    />
                </div>

                <p className="settings-footer">
                    {locale.appName} · v{APP_VERSION}
                </p>
            </main>
        </div>
    );
};

export default Settings;
