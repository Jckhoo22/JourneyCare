import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import "./Modal.css";

/**
 * The shared dialog shell. [Parts shelf redesign, Modal shell fix]
 *
 * One component behind every centred-card / bottom-sheet overlay in the app:
 * PartDialog (the add/edit-part form) and PhotoEditor (the crop stage) both
 * render into this shell so a fix here fixes every dialog at once. That
 * consolidation is deliberate — the earlier duplication is exactly why the
 * "panel stretches to viewport height on desktop" bug got shipped in two
 * places at once.
 *
 * ── Two variants, one shell ─────────────────────────────────────────────
 *   mobile (< 640px)  full-screen sheet: dialog fills the viewport,
 *                     body flex-grows so the footer pins to the bottom.
 *   desktop (≥ 640px) centred card: dialog hugs its content, capped at
 *                     85vh, transform-centred over a scrim. Body sizes
 *                     to its content (no flex-grow), so a short form has
 *                     no dead white space below the footer; a taller
 *                     form scrolls the body while header and footer stay
 *                     visible.
 *
 * The bug this replaces: `inset: 0; margin: auto; height: auto` on a
 * fixed-positioned dialog does NOT centre — CSS 2.1 §10.6.4 says when
 * top AND bottom are pinned and height is auto, auto margins resolve to
 * 0 and the element stretches to fill the viewport (capped by max-height).
 * The desktop rule below uses `top: 50%; left: 50%; transform: translate`
 * instead, which is dimension-independent and always centres.
 *
 * ── Sizes and flush ─────────────────────────────────────────────────────
 * `size` picks a desktop max-width via a CSS variable (`--modal-max-width`).
 * `flush` removes the body's default padding and gap for callers whose
 * content wants to sit edge-to-edge — PhotoEditor's dark crop stage is
 * the only current user.
 *
 * Native `<dialog>` gives us the focus trap, the inert background, and Esc
 * behaviour for free. We forward the cancel event to `onClose` so the caller
 * owns any cleanup (URL revoke, form reset).
 */

type ModalSize = "md" | "2xl";

const SIZE_TO_MAX_WIDTH: Record<ModalSize, string> = {
    md: "28rem",
    "2xl": "42rem",
};

interface ModalProps {
    /** Title text shown in the header. Doubles as the aria-labelledby target. */
    title: string;
    /** Called when the user closes the modal (X button, Esc, backdrop click). */
    onClose: () => void;
    children: ReactNode;
    /** Right-aligned action row rendered in the footer. */
    footer?: ReactNode;
    /** Accessible label for the close X button. Defaults to "Close". */
    closeLabel?: string;
    /**
     * True while the caller is running an async save. Disables the close X
     * and swallows Esc / backdrop dismissals so a mid-write click can't drop
     * the form.
     */
    isBusy?: boolean;
    /** Desktop max-width. "md" (28rem) for forms; "2xl" (42rem) for media. */
    size?: ModalSize;
    /**
     * Remove body padding + gap so caller content can sit edge-to-edge.
     * Used by PhotoEditor for the dark crop stage.
     */
    flush?: boolean;
}

const Modal = ({
    title,
    onClose,
    children,
    footer,
    closeLabel = "Close",
    isBusy = false,
    size = "md",
    flush = false,
}: ModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (!dialog.open) dialog.showModal();
        return () => {
            if (dialog.open) dialog.close();
        };
    }, []);

    // Native <dialog> fires "cancel" on Esc. Forward it to onClose (or swallow
    // it if we're busy) so the caller controls the lifecycle.
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const handleCancel = (event: Event) => {
            event.preventDefault();
            if (!isBusy) onClose();
        };
        dialog.addEventListener("cancel", handleCancel);
        return () => dialog.removeEventListener("cancel", handleCancel);
    }, [isBusy, onClose]);

    // Backdrop click closes. Native <dialog>'s click event fires on the
    // dialog itself when the user clicks the backdrop, so we compare targets.
    const handleClick = (event: React.MouseEvent<HTMLDialogElement>) => {
        if (event.target === dialogRef.current && !isBusy) onClose();
    };

    // Passing the max-width via a CSS variable keeps size selection in the
    // component prop (typed) instead of scattering `.app-modal-2xl` classes
    // in the caller trees.
    const dialogStyle = {
        "--modal-max-width": SIZE_TO_MAX_WIDTH[size],
    } as React.CSSProperties;

    return (
        <dialog
            ref={dialogRef}
            className="app-modal"
            style={dialogStyle}
            aria-labelledby={titleId}
            onClick={handleClick}
        >
            <div className="app-modal-shell">
                <header className="app-modal-head">
                    <h2 id={titleId} className="app-modal-title">
                        {title}
                    </h2>
                    <button
                        type="button"
                        className="app-modal-close"
                        onClick={onClose}
                        aria-label={closeLabel}
                        disabled={isBusy}
                    >
                        <X size={20} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                </header>

                <div
                    className={`app-modal-body ${
                        flush ? "app-modal-body-flush" : ""
                    }`}
                >
                    {children}
                </div>

                {footer && <footer className="app-modal-foot">{footer}</footer>}
            </div>
        </dialog>
    );
};

export default Modal;
