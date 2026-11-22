import {
    useEffect,
    useId,
    useRef,
    useState,
    type ChangeEvent,
    type ComponentType,
    type KeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import "./ComboField.css";

export interface ComboOption {
    value: string;
    label: string;
}

interface ComboFieldProps {
    label: string;
    placeholder: string;
    /**
     * Leading icon inside the field. Optional — the in-app car form omits
     * it to sit alongside Settings' icon-less inputs. When absent, the
     * `.car-fields` scope in CarFields.css drops the icon-inset padding.
     */
    icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
    value: string;
    /** Called with the selected option's `value`. Empty on revert/clear. */
    onChange: (value: string) => void;
    options: ComboOption[];
    error?: string;
    disabled?: boolean;
}

/**
 * A type-to-search dropdown. Same chrome as AuthTextField / SelectField —
 * `.input-group`, `.input-wrapper`, `.form-control`, leading icon, trailing
 * chevron — so it sits inline with the other fields.
 *
 * ── Why this exists next to SelectField ────────────────────────────────────
 * SelectField.tsx explains at length why a native `<select>` was the right
 * pick for the brand/model dropdowns when those lists were shorter. As the
 * catalogue grew (39 brands and up), scrolling the OS picker to reach
 * "Perodua" became the slow path. This combobox filters as you type without
 * losing the styling that ties the form together. SelectField stays where
 * it is (year, maintenance-type groups) — this is only for the two long,
 * flat pickers.
 *
 * ── Behaviour ──────────────────────────────────────────────────────────────
 *   • Focus opens the list; typing filters (case-insensitive substring on
 *     the label).
 *   • Click or Enter on a highlighted row commits.
 *   • Arrow up/down moves the highlight; Escape or clicking outside closes
 *     and reverts the query to the last committed value.
 *   • Blur closes (short delay so a click on an option lands first); if the
 *     input was left as free text that never matched, the query snaps back
 *     to the current `value` so the field can't display something that
 *     isn't the state.
 *   • When `value` changes from outside (brand reset clearing model), the
 *     query follows — as long as the user isn't in the middle of typing.
 */
const ComboField = ({
    label,
    placeholder,
    icon: Icon,
    value,
    onChange,
    options,
    error,
    disabled = false,
}: ComboFieldProps) => {
    const id = useId();
    const errorId = `${id}-error`;
    const listboxId = `${id}-listbox`;

    const [query, setQuery] = useState(value);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    // Tracks the "actively typing" beat: keeps the value→query sync from
    // clobbering what the user just typed if a parent re-renders.
    const isTypingRef = useRef(false);
    const blurTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isTypingRef.current) setQuery(value);
    }, [value]);

    useEffect(() => {
        return () => {
            if (blurTimerRef.current !== null) {
                window.clearTimeout(blurTimerRef.current);
            }
        };
    }, []);

    // Query === value happens whenever the field is closed on a committed
    // pick; showing the full list is what a user hitting the chevron wants.
    const queryIsSelection = query === value;
    const trimmed = query.trim().toLowerCase();
    const filtered =
        trimmed === "" || queryIsSelection
            ? options
            : options.filter((opt) => opt.label.toLowerCase().includes(trimmed));

    const commit = (opt: ComboOption) => {
        isTypingRef.current = false;
        setQuery(opt.label);
        setIsOpen(false);
        setActiveIndex(-1);
        onChange(opt.value);
    };

    const revert = () => {
        isTypingRef.current = false;
        setQuery(value);
        setActiveIndex(-1);
    };

    const handleFocus = () => {
        setIsOpen(true);
    };

    const handleBlur = () => {
        // Small delay so an option's onMouseDown → commit lands first. The
        // ref lets us cancel the timer on unmount without leaking a state
        // update onto a torn-down component.
        if (blurTimerRef.current !== null) {
            window.clearTimeout(blurTimerRef.current);
        }
        blurTimerRef.current = window.setTimeout(() => {
            blurTimerRef.current = null;
            setIsOpen(false);
            // If the user left free text that never matched, snap back to
            // the last committed value. The field is a picker; a display
            // that isn't the state is a lie.
            if (query !== value) revert();
        }, 120);
    };

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        isTypingRef.current = true;
        setQuery(event.target.value);
        setIsOpen(true);
        setActiveIndex(-1);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((idx) =>
                filtered.length === 0 ? -1 : Math.min(idx + 1, filtered.length - 1),
            );
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((idx) => Math.max(idx - 1, 0));
        } else if (event.key === "Enter") {
            if (isOpen && activeIndex >= 0 && filtered[activeIndex]) {
                event.preventDefault();
                commit(filtered[activeIndex]);
            }
        } else if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
            revert();
        }
    };

    return (
        <div className="input-group">
            <label className="input-label" htmlFor={id}>
                {label}
            </label>

            <div
                className={`input-wrapper combo-wrapper ${
                    error ? "error" : ""
                }${Icon ? "" : " no-icon"}`}
            >
                {Icon && (
                    <div className="input-icon left">
                        <Icon size={20} strokeWidth={1.5} />
                    </div>
                )}

                <input
                    id={id}
                    type="text"
                    role="combobox"
                    className="form-control combo-input"
                    value={query}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-expanded={isOpen}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                        isOpen && activeIndex >= 0
                            ? `${id}-option-${activeIndex}`
                            : undefined
                    }
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                />

                {/* Decorative chevron — same treatment as SelectField, so a
                    combo and a select read as siblings. Taps fall through
                    to the input, which opens the list on focus. */}
                <div className="input-icon right combo-chevron" aria-hidden="true">
                    <ChevronDown size={18} strokeWidth={2} />
                </div>

                {isOpen && filtered.length > 0 && (
                    <ul
                        id={listboxId}
                        role="listbox"
                        className="combo-list"
                    >
                        {filtered.map((opt, idx) => (
                            <li
                                key={opt.value}
                                id={`${id}-option-${idx}`}
                                role="option"
                                aria-selected={opt.value === value}
                                className={
                                    idx === activeIndex
                                        ? "combo-option active"
                                        : "combo-option"
                                }
                                // onMouseDown, not onClick: mouseDown fires
                                // before the input's blur, so preventDefault
                                // keeps focus and commit lands cleanly.
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    commit(opt);
                                }}
                            >
                                {opt.label}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {error && (
                <span className="field-error-text" id={errorId}>
                    {error}
                </span>
            )}
        </div>
    );
};

export default ComboField;
