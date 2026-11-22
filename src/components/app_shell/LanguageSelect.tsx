import "./LanguageSelect.css";

import { useLanguage, type SupportedLanguage } from "../../context/LanguageContext";

/**
 * The language dropdown, shared by Settings and the first-entry
 * username gate. [Language spec #5]
 *
 * Rendering both surfaces from one component keeps their behaviour
 * identical: the same instant-apply, the same fire-and-forget write,
 * the same options in the same order. The username gate needs it so
 * that a Malay-preference user's very first visible screen after
 * sign-up speaks Malay, without an intermediate English flash.
 *
 * The select uses a `<label>` wrapper so the caller decides the label
 * text — Settings names it "Language", the gate names it too.
 * `id` is required so the wrapping label associates cleanly for
 * screen readers.
 */
interface LanguageSelectProps {
    id: string;
    label: string;
    hint?: string;
    disabled?: boolean;
}

const LANGUAGE_LABEL_KEY: Record<
    SupportedLanguage,
    "languageEn" | "languageMs" | "languageZh"
> = {
    en: "languageEn",
    ms: "languageMs",
    zh: "languageZh",
};

const LanguageSelect = ({ id, label, hint, disabled }: LanguageSelectProps) => {
    const { locale, language, setLanguage } = useLanguage();

    return (
        <div className="language-select">
            <label className="language-select-label" htmlFor={id}>
                {label}
            </label>
            <select
                id={id}
                className="language-select-input"
                value={language}
                disabled={disabled}
                onChange={(event) => {
                    // setLanguage handles: instant context update, localStorage
                    // write, and the background Firestore write. Nothing to
                    // await here — the visible change happens synchronously
                    // in this same event loop tick.
                    setLanguage(event.target.value as SupportedLanguage);
                }}
            >
                <option value="en">
                    {locale.settings[LANGUAGE_LABEL_KEY.en]}
                </option>
                <option value="ms">
                    {locale.settings[LANGUAGE_LABEL_KEY.ms]}
                </option>
                <option value="zh">
                    {locale.settings[LANGUAGE_LABEL_KEY.zh]}
                </option>
            </select>
            {hint && <p className="language-select-hint">{hint}</p>}
        </div>
    );
};

export default LanguageSelect;
