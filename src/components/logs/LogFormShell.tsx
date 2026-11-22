import { type ComponentType, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import "../../styles/auth-shell.css";
import "./LogFormShell.css";

import { useLanguage } from "../../context/LanguageContext";

interface LogFormShellProps {
    /** Identity mark rendered inside `.icon-box` above the form's header. */
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    /** Route to navigate to when the back button is confirmed. */
    backTo: string;
    /** Label on the back button — usually the car's display name. Falls
        back to `locale.common.back` if empty/missing while it loads. */
    backLabel: string | null | undefined;
    /**
     * When true, a back tap confirms via native `window.confirm()` before
     * navigating. Callers compute this from their draft state so a
     * half-typed visit isn't lost on a stray tap.
     */
    isDirty: boolean;
    children: ReactNode;
}

/** Cap so the back label never wraps the button on a 375px viewport. */
const MAX_LABEL = 20;

const truncate = (text: string, max: number): string =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * The shared card shell for the two logging forms. [Log-forms consistency]
 *
 * AddLog (a single service entry) and AddVisit (a workshop visit, many
 * items) shared the same `.auth-card` chrome but each spelled it out
 * page-side — icon block, header, and a back link in the footer beneath
 * the primary Save. That let them drift: AddVisit gained density from
 * its item cards while AddLog stayed sparser, and the "← {car name}"
 * back link sat one thumb-slip away from Save.
 *
 * This shell owns the outer chrome so both forms are pixel-identical
 * around their bodies, and moves the back affordance to the top-left as
 * a real button (chevron + car name, ghost, ≥44px, teal, focus ring).
 * When the caller reports `isDirty`, tapping back fires a native
 * `confirm()` before navigating — cheap belt-and-braces against losing
 * a half-filled entry.
 */
const LogFormShell = ({
    icon: Icon,
    backTo,
    backLabel,
    isDirty,
    children,
}: LogFormShellProps) => {
    const navigate = useNavigate();
    const { locale } = useLanguage();

    const displayLabel =
        backLabel && backLabel.trim().length > 0
            ? truncate(backLabel.trim(), MAX_LABEL)
            : locale.common.back;

    const handleBack = () => {
        if (isDirty && !window.confirm(locale.logs.discardEntryPrompt)) {
            return;
        }
        navigate(backTo);
    };

    return (
        <div className="app-container">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <div className="auth-card log-form-card">
                <button
                    type="button"
                    className="log-form-back"
                    onClick={handleBack}
                    aria-label={`${locale.common.back}: ${displayLabel}`}
                >
                    <ChevronLeft
                        size={18}
                        strokeWidth={2.25}
                        aria-hidden="true"
                    />
                    <span>{displayLabel}</span>
                </button>

                <div className="icon-header">
                    <div className="icon-box">
                        <Icon size={28} strokeWidth={2} />
                    </div>
                </div>

                {children}
            </div>
        </div>
    );
};

export default LogFormShell;
