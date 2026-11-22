import { useId } from "react";
import { RefreshCw } from "lucide-react";
import "./IntervalEditor.css";

import { useLanguage } from "../../context/LanguageContext";

interface IntervalEditorProps {
    km: string;
    months: string;
    onChange: (next: { km?: string; months?: string }) => void;
    /** The preset's defaults, for the "reset" affordance. Empty means none. */
    defaults: { km: string; months: string };
    kmError?: string;
    monthsError?: string;
    disabled?: boolean;
}

/**
 * When this service is next due. [L4]
 *
 * Four states, and they're all just "what's in these two boxes":
 *
 *   km only        due at odometer + km
 *   months only    due at date + months
 *   both           whichever comes first
 *   neither        no reminder for this entry
 *
 * Modelled as two optional numbers rather than a mode selector, because a mode
 * selector would be a second thing to keep in sync with the values — and
 * because "clear the box" is a more obvious way to say "not this one" than
 * hunting for a None option.
 *
 * Prefilled from the preset and freely editable: the defaults are a starting
 * point, not a rule. Custom entries start empty.
 */
const IntervalEditor = ({
    km,
    months,
    onChange,
    defaults,
    kmError,
    monthsError,
    disabled = false,
}: IntervalEditorProps) => {
    const { locale } = useLanguage();
    const kmId = useId();
    const monthsId = useId();

    const hasDefaults = Boolean(defaults.km || defaults.months);
    const isDefault = km === defaults.km && months === defaults.months;
    const both = Boolean(km.trim() && months.trim());
    const neither = !km.trim() && !months.trim();

    return (
        <fieldset className="interval" disabled={disabled}>
            <legend className="interval-legend">{locale.logs.intervalTitle}</legend>

            <div className="interval-fields">
                <div className="interval-field">
                    <label className="interval-label" htmlFor={kmId}>
                        {locale.logs.intervalKmLabel}
                    </label>
                    <input
                        id={kmId}
                        className="interval-input"
                        inputMode="numeric"
                        placeholder={locale.logs.intervalNone}
                        value={km}
                        onChange={(event) => onChange({ km: event.target.value })}
                        aria-invalid={kmError ? true : undefined}
                    />
                </div>

                <div className="interval-field">
                    <label className="interval-label" htmlFor={monthsId}>
                        {locale.logs.intervalMonthsLabel}
                    </label>
                    <input
                        id={monthsId}
                        className="interval-input"
                        inputMode="numeric"
                        placeholder={locale.logs.intervalNone}
                        value={months}
                        onChange={(event) => onChange({ months: event.target.value })}
                        aria-invalid={monthsError ? true : undefined}
                    />
                </div>
            </div>

            {(kmError || monthsError) && (
                <p className="interval-error">{kmError || monthsError}</p>
            )}

            {/* Says what the two boxes currently mean, so nobody has to infer
                "whichever comes first" from an empty field. */}
            <p className="interval-summary">
                {neither
                    ? locale.logs.intervalSummaryNone
                    : both
                      ? locale.logs.intervalSummaryBoth
                      : locale.logs.intervalSummaryOne}
            </p>

            {hasDefaults && !isDefault && (
                <button
                    type="button"
                    className="interval-reset"
                    onClick={() => onChange({ km: defaults.km, months: defaults.months })}
                >
                    <RefreshCw size={13} strokeWidth={2.5} />
                    <span>{locale.logs.intervalReset}</span>
                </button>
            )}
        </fieldset>
    );
};

export default IntervalEditor;
