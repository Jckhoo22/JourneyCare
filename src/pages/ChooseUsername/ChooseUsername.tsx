import { useState, type ChangeEvent, type FormEvent } from "react";
import { User, Smile, ArrowRight } from "lucide-react";
import "../../styles/auth-shell.css";
import "./ChooseUsername.css";

import AuthTextField from "../../components/login_register/AuthTextField";
import LanguageSelect from "../../components/app_shell/LanguageSelect";
import { Button } from "../../components/ui";
import { useAuthController } from "../../controller/AuthController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";

/**
 * One-time display-name screen. [A6]
 *
 * Every account passes through here on first entry — email accounts after
 * verifying, social accounts straight after their first sign-in — and it is the
 * only place `users/{uid}.username` is ever written. Once set, the route guard
 * stops sending anyone back.
 */
const ChooseUsername = () => {
    const { locale } = useLanguage();
    const { user } = useUser();
    const { chooseUsername, logout, isLoading, errors, clearError } =
        useAuthController();

    // Social providers hand us a display name; offer it as a starting point the
    // user can edit. They still have to press Continue, so it stays a choice.
    //
    // Derived rather than seeded into useState: the session can arrive after
    // this screen's first render, and a useState initialiser would have already
    // captured an empty prefill by then. Once the user types anything — even
    // clearing the field — `draft` takes over for good.
    const [draft, setDraft] = useState<string | null>(null);
    const username = draft ?? user?.nickname ?? "";

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setDraft(event.target.value);
        clearError("username");
    };

    // On success the guard swaps this screen for home — nothing to route here.
    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await chooseUsername(username);
    };

    return (
        <div className="app-container">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <div className="auth-card">
                <div className="icon-header">
                    <div className="icon-box">
                        <Smile size={30} strokeWidth={2} />
                    </div>
                </div>

                <div className="text-header">
                    <h1 className="title">{locale.username.title}</h1>
                    <p className="subtitle">{locale.username.subtitle}</p>
                </div>

                <form onSubmit={handleSubmit} className="animate-fade-in" noValidate>
                    {/* Language picker above the display-name field. This is
                        every account's FIRST screen after sign-up, and the
                        gate must speak the user's language before the user
                        commits to a name — see LanguageContext.tsx boot
                        resolution. Setting a language here writes it to
                        localStorage instantly and to Firestore in the
                        background; the gate re-renders in the chosen
                        language in the same event tick. */}
                    <LanguageSelect
                        id="username-gate-language"
                        label={locale.settings.languageLabel}
                        disabled={isLoading}
                    />

                    <AuthTextField
                        label={locale.fields.usernameLabel}
                        placeholder={locale.fields.usernamePlaceholder}
                        type="text"
                        icon={User}
                        value={username}
                        onChange={handleChange}
                        error={errors.username}
                        autoComplete="nickname"
                        disabled={isLoading}
                    />

                    <p className="username-hint">{locale.username.hint}</p>

                    <Button
                        type="submit"
                        variant="primary"
                        icon={isLoading ? undefined : ArrowRight}
                        iconTrailing
                        disabled={isLoading}
                        label={
                            isLoading
                                ? locale.common.processing
                                : locale.username.submitButton
                        }
                    />

                    <div className="username-footer">
                        <button
                            className="username-signout-link"
                            type="button"
                            onClick={logout}
                        >
                            {locale.username.signOut}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChooseUsername;
