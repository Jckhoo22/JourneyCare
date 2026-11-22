import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

/**
 * The single button primitive. [UX pass R1, R2, R3]
 *
 * One API for every clickable action in the app. Enforces:
 *   R1 — variants are semantic (`primary`, `secondary`, `danger`,
 *        `danger-solid`, `text`). A screen with two `primary` uses is
 *        the caller's smell, not the primitive's.
 *   R2 — buttons look like buttons. `label` is required; icons are
 *        decorative. No icon-only variant is offered.
 *   R3 — ≥44px touch target via the shared `.app-btn` CSS (which sets
 *        `min-height: --control-height` = 48px on filled variants and
 *        `--tap-min` = 44px on `text`).
 *
 * ── Why classnames rather than a fresh stylesheet ──────────────────────────
 * The existing `.app-btn-*` classes already carry the teal accent, the hover
 * lift, the pressed-flat, the shadow token and the mobile-first "full width
 * ≤ 600px, auto-width above" behaviour, and they're what every screenshot
 * has been reviewed against. Phase 1 is API consolidation, not restyle;
 * every visual change ships in Phase 2/3.
 */

type Variant =
    | "primary"
    | "secondary"
    | "danger"
    | "danger-soft"
    | "danger-solid"
    | "text";

const VARIANT_CLASSES: Record<Variant, string> = {
    primary: "app-btn app-btn-primary",
    secondary: "app-btn app-btn-secondary",
    danger: "app-btn app-btn-danger",
    "danger-soft": "app-btn app-btn-danger-soft",
    "danger-solid": "app-btn app-btn-danger-solid",
    text: "app-btn-quiet",
};

/** Icon size chosen to sit at 44/48px height without visual crowding. */
const ICON_SIZE = 18;
const ICON_STROKE = 2.5;

interface CommonProps {
    /** The button's visible text. R2: always required, never blank. */
    label: ReactNode;
    /**
     * Icon rendered before the label by default (or after, if `iconTrailing`).
     * Purely decorative — `label` is what tells the user what will happen.
     */
    icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
    iconTrailing?: boolean;
    variant?: Variant;
    /**
     * Full-width by default (mobile pattern). `inline` opts the button back
     * to auto-width on ≥600px screens; matches the existing `.app-btn-inline`
     * behaviour.
     */
    inline?: boolean;
    /** Extra classes for one-off tweaks (rare — reach for a variant first). */
    className?: string;
}

interface ButtonAsButtonProps
    extends CommonProps,
        Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> {
    to?: never;
}

interface ButtonAsLinkProps
    extends CommonProps,
        Omit<LinkProps, "children" | "className"> {
    to: string;
}

type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

/**
 * Content shared by the button and link forms: optional leading icon, the
 * label, optional trailing icon. Icons are `aria-hidden` because the label
 * already carries the semantics.
 */
const Content = ({
    icon: Icon,
    iconTrailing,
    label,
}: Pick<CommonProps, "icon" | "iconTrailing" | "label">) => (
    <>
        {Icon && !iconTrailing && (
            <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
        )}
        <span>{label}</span>
        {Icon && iconTrailing && (
            <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
        )}
    </>
);

const classFor = (
    variant: Variant,
    inline: boolean | undefined,
    extra: string | undefined,
): string =>
    [
        VARIANT_CLASSES[variant],
        // `.app-btn-inline` opts a filled button back to auto-width on wide
        // screens; the `text` variant is naturally inline (has no width rule).
        inline && variant !== "text" ? "app-btn-inline" : "",
        extra ?? "",
    ]
        .filter(Boolean)
        .join(" ");

/**
 * Renders a `<button>` or a `<Link to>` depending on whether `to` is passed.
 * The two paths share exactly the same visual chrome; the choice is only
 * about semantics (does this fire an action, or navigate?).
 */
const Button = (props: ButtonProps) => {
    const {
        icon,
        iconTrailing,
        label,
        variant = "primary",
        inline,
        className,
    } = props;

    const finalClass = classFor(variant, inline, className);
    const content = (
        <Content icon={icon} iconTrailing={iconTrailing} label={label} />
    );

    if ("to" in props && props.to !== undefined) {
        // Discriminated union: destructure link-only rest without the
        // button-only fields sneaking through.
        const {
            to,
            icon: _icon,
            iconTrailing: _iconTrailing,
            label: _label,
            variant: _variant,
            inline: _inline,
            className: _className,
            ...linkRest
        } = props;
        return (
            <Link to={to} className={finalClass} {...linkRest}>
                {content}
            </Link>
        );
    }

    const {
        icon: _icon,
        iconTrailing: _iconTrailing,
        label: _label,
        variant: _variant,
        inline: _inline,
        className: _className,
        ...buttonRest
    } = props as ButtonAsButtonProps;
    // Sensible default: buttons inside a form submit. Callers can override.
    const type = buttonRest.type ?? "button";
    return (
        <button className={finalClass} {...buttonRest} type={type}>
            {content}
        </button>
    );
};

export default Button;
export type { ButtonProps };
