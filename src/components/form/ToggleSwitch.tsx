import { useId } from "react";
import "./ToggleSwitch.css";

interface ToggleSwitchProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    /** Always supplied — hidden visually when `labelHidden`, never absent. */
    label: string;
    /** Optional second line under the label. */
    hint?: string;
    /**
     * For grid cells, where the column header already names the thing and a
     * repeated label per cell would be noise on screen — but a screen reader
     * still needs it, so it moves to the accessible name rather than vanishing.
     */
    labelHidden?: boolean;
    disabled?: boolean;
    /**
     * A write triggered by this switch is in flight. Renders a subdued state
     * (thumb dot pulses, track dims) and blocks further input — the paired
     * `disabled` MUST also be set so the underlying checkbox stops accepting
     * clicks, not just clicks that happen to hit the track. */
    pending?: boolean;
    /**
     * Label placement.
     *   `"start"` (default) — track first, label after. Switch-first shape
     *   used for a control whose label reads as an action ("Turn on
     *   notifications").
     *   `"split"` — label pushed LEFT with `flex: 1`, track pushed RIGHT.
     *   The settings-list convention: the label reads as a stable capability
     *   ("Can edit all cars") and the switch reads as its current state.
     */
    layout?: "start" | "split";
}

/**
 * A switch, built on a real checkbox.
 *
 * The input is visually hidden rather than replaced, so keyboard focus,
 * space-to-toggle, and screen-reader semantics all come for free — a `div` with
 * `role="switch"` would need every one of those written by hand and would still
 * be worse.
 *
 * Shared by the group-level "can add cars" toggle [C1] and the per-car edit
 * toggles [C7]. One implementation on purpose: the two grant different things
 * and are kept apart by which panel they sit in and what they're labelled, not
 * by looking different — a second switch design would just make the interface
 * harder to read.
 */
const ToggleSwitch = ({
    checked,
    onChange,
    label,
    hint,
    labelHidden = false,
    disabled = false,
    pending = false,
    layout = "start",
}: ToggleSwitchProps) => {
    const id = useId();

    return (
        <label
            className={`toggle ${labelHidden ? "toggle-compact" : ""} ${
                disabled ? "toggle-disabled" : ""
            } ${pending ? "toggle-pending" : ""} ${
                layout === "split" ? "toggle-split" : ""
            }`}
            htmlFor={id}
        >
            <input
                id={id}
                type="checkbox"
                className="toggle-input"
                checked={checked}
                disabled={disabled}
                aria-busy={pending || undefined}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span className="toggle-track" aria-hidden="true">
                <span className="toggle-thumb" />
            </span>

            <span className={labelHidden ? "toggle-sr" : "toggle-text"}>
                {label}
                {!labelHidden && hint && (
                    <span className="toggle-hint">{hint}</span>
                )}
            </span>
        </label>
    );
};

export default ToggleSwitch;
