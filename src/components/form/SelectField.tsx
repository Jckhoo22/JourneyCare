import { ChevronDown } from "lucide-react";
import { useId, type ChangeEvent, type ComponentType } from "react";
import "./SelectField.css";

export interface SelectOption {
    value: string;
    label: string;
}

/** A labelled `<optgroup>`. Used by the maintenance type picker. [L3] */
export interface SelectGroup {
    label: string;
    options: SelectOption[];
}

interface SelectFieldProps {
    label: string;
    value: string;
    onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    /** Flat list. Ignored when `groups` is supplied. */
    options?: SelectOption[];
    /** Grouped list, rendered as `<optgroup>`s in the order given. */
    groups?: SelectGroup[];
    /** Shown as a disabled first entry while nothing is chosen. */
    placeholder: string;
    /**
     * Leading icon inside the field. Optional — the in-app car form omits
     * it to match Settings' icon-less inputs. When absent, the `.car-fields`
     * scope in CarFields.css drops the icon-inset padding.
     */
    icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
    error?: string;
    disabled?: boolean;
}

/**
 * A labelled dropdown, styled to sit beside AuthTextField.
 *
 * A native `<select>` on purpose: on a phone it opens the OS picker — a
 * scrollable wheel on iOS, a full-height list on Android — which beats any
 * custom listbox for the 40-option brand list, and costs nothing in
 * accessibility or keyboard support. The only styling here is the chrome
 * around it; the options themselves are the platform's.
 *
 * It also gets type-to-filter for free: every desktop browser jumps to the
 * matching option as you type into an open `<select>`. That is why the brand
 * list stayed native when it grew from 9 brands to 39 — a custom combobox
 * would have bought a visible filter box at the cost of the OS picker, which
 * is the better control on the phones most of this app's users are holding.
 */
const SelectField = ({
    label,
    value,
    onChange,
    options = [],
    groups,
    placeholder,
    icon: Icon,
    error,
    disabled = false,
}: SelectFieldProps) => {
    const isEmpty = groups
        ? groups.every((group) => group.options.length === 0)
        : options.length === 0;

    // Ties the label to the control. Without it a screen reader announces an
    // unlabelled combo box, and tapping the label does nothing.
    const id = useId();
    const errorId = `${id}-error`;

    return (
        <div className="input-group">
            <label className="input-label" htmlFor={id}>
                {label}
            </label>

            <div
                className={`input-wrapper ${error ? "error" : ""}${
                    Icon ? "" : " no-icon"
                }`}
            >
                {Icon && (
                    <div className="input-icon left">
                        <Icon size={20} strokeWidth={1.5} />
                    </div>
                )}

                <select
                    id={id}
                    className="form-control select-control"
                    value={value}
                    onChange={onChange}
                    disabled={disabled || isEmpty}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                >
                    <option value="" disabled>
                        {placeholder}
                    </option>

                    {/* Native optgroups: the OS picker renders them as section
                        headers on a phone, which is exactly what a 15-item
                        maintenance list needs. [L3] */}
                    {groups
                        ? groups.map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                  {group.options.map((option) => (
                                      <option key={option.value} value={option.value}>
                                          {option.label}
                                      </option>
                                  ))}
                              </optgroup>
                          ))
                        : options.map((option) => (
                              <option key={option.value} value={option.value}>
                                  {option.label}
                              </option>
                          ))}
                </select>

                {/* Decorative: the native control's own arrow is hidden so the
                    chevron matches the rest of the app's iconography. */}
                <div className="input-icon right select-chevron" aria-hidden="true">
                    <ChevronDown size={18} strokeWidth={2} />
                </div>
            </div>

            {error && (
                <span className="field-error-text" id={errorId}>
                    {error}
                </span>
            )}
        </div>
    );
};

export default SelectField;
