import { useId, useState, type ChangeEvent, type ComponentType } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./AuthTextField.css";

interface AuthTextFieldProps {
    label: string;
    placeholder: string;
    type?: string;
    /**
     * Leading icon inside the input. Optional — some surfaces (the CardShell
     * screens, Settings' name field) want a plain input with no decorative
     * mark. When omitted, the field's left padding drops back to the normal
     * text gutter so the caret sits where the placeholder starts.
     */
    icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
    isPassword?: boolean;
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    error?: string;
    autoComplete?: string;
    disabled?: boolean;
    /**
     * Which on-screen keyboard a phone should offer. "numeric" is the one worth
     * reaching for — it gives a digit keypad without the desktop spinner arrows
     * that `type="number"` drags along, and without number inputs' habit of
     * silently discarding anything non-numeric the user typed.
     */
    inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
    /**
     * Hard stop on length, where a bound already exists in `constants/regex`.
     * Belt to validation's braces: the field simply stops accepting keystrokes
     * rather than letting someone type a paragraph and then be told no.
     */
    maxLength?: number;
    /**
     * Paste-friendly overrides for URL/code fields. Left off by default —
     * autoCapitalize="sentences" and correct/spellcheck ON is what you want
     * for a name or note, and mangling is what you get for a URL.
     */
    autoCapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters";
    autoCorrect?: "on" | "off";
    spellCheck?: boolean;
}

const AuthTextField = ({
    label,
    placeholder,
    type = "text",
    icon: Icon,
    isPassword = false,
    value,
    onChange,
    error,
    autoComplete,
    disabled = false,
    inputMode,
    maxLength,
    autoCapitalize,
    autoCorrect,
    spellCheck,
}: AuthTextFieldProps) => {
    const [showPassword, setShowPassword] = useState(false);
    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    // The label used to sit next to the input with nothing tying them
    // together, so a screen reader announced an unlabelled edit box and a tap
    // on the label did nothing. useId keeps the pairing unique even when the
    // same field renders twice on one screen.
    const id = useId();
    const errorId = `${id}-error`;

    return (
        <div className="input-group">
            <label className="input-label" htmlFor={id}>
                {label}
            </label>

            {/* CLEANER LOGIC:
                We just add the class 'error' if the error prop exists.
                CSS handles the border color.
            */}
            <div className={`input-wrapper ${error ? 'error' : ''}${Icon ? '' : ' no-icon'}`}>

                {Icon && (
                    <div className="input-icon left">
                        {/* We remove the manual color prop.
                           CSS (.input-wrapper.error .input-icon) now controls the color.
                        */}
                        <Icon size={20} strokeWidth={1.5} />
                    </div>
                )}

                <input
                    id={id}
                    type={inputType}
                    placeholder={placeholder}
                    className="form-control"
                    value={value}
                    onChange={onChange}
                    autoComplete={autoComplete}
                    disabled={disabled}
                    inputMode={inputMode}
                    maxLength={maxLength}
                    autoCapitalize={autoCapitalize}
                    autoCorrect={autoCorrect}
                    spellCheck={spellCheck}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                />

                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="input-icon right toggle-btn"
                    >
                        {showPassword ? <Eye size={18} strokeWidth={1.5} /> : <EyeOff size={18} strokeWidth={1.5} />}
                    </button>
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

export default AuthTextField;
