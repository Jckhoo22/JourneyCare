import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import "./ConfirmDialog.css";

/**
 * Modal confirm dialog. [UX pass R10, then car polish]
 *
 * The two-step confirm pattern lives in a lot of places (log delete, member
 * remove, group delete, group leave, car delete, photo remove, fix totals),
 * and every one of them used to render INLINE — a red-tinted block that
 * replaced its trigger in the page flow. That shape read on a phone as "the
 * page has just grown a red rectangle where my button was", not as "I have
 * been asked a question I must answer", and on a long page the confirm could
 * scroll off-screen while the trigger stayed put.
 *
 * The card is neutral (surface white, hairline border): the destructive
 * signal lives in the confirm button, not the container. Making the whole
 * card red conflates "this is dangerous" with "this is an error", which the
 * app uses red for elsewhere.
 *
 * Behaviour, standard modal:
 *   - portal to <body> so the app-page's overflow rules don't clip it
 *   - dimmed backdrop; click outside the card = cancel
 *   - Esc while not busy = cancel
 *   - focus moves into the card on open and returns to the trigger on close
 *   - body scroll locked while open, with scrollbar-gutter compensation so
 *     the page beneath does not shift right when the scrollbar vanishes
 */
interface ConfirmDialogProps {
    /** Short heading — the action, verb-first. e.g. "Delete entry". */
    title: string;
    /** One or two short sentences naming the consequence. */
    prompt: ReactNode;
    /** The destructive/primary label. */
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** Disables both buttons while the write is in flight. */
    isBusy?: boolean;
    /** Label swap while busy — e.g. "Removing…". */
    busyLabel?: string;
    /**
     * The confirm button's tone. Most confirms are destructive, so this
     * defaults to `danger` (red). Pass `primary` for a benign confirm
     * (e.g. "yes, recalculate the totals").
     */
    tone?: "danger" | "primary";
}

const ConfirmDialog = ({
    title,
    prompt,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    isBusy = false,
    busyLabel,
    tone = "danger",
}: ConfirmDialogProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<Element | null>(null);
    const descId = useId();

    // Focus in on open, restore on close.
    useEffect(() => {
        previouslyFocused.current = document.activeElement;
        // Focus the card itself, not the destructive button — a destructive
        // action pre-focused would be one Enter away from firing.
        cardRef.current?.focus();

        return () => {
            const target = previouslyFocused.current;
            if (target instanceof HTMLElement) target.focus();
        };
    }, []);

    // Esc cancels. Registered in an effect that reads the latest onCancel /
    // isBusy on each render, since a fresh handler shouldn't need a new effect.
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isBusy) {
                event.stopPropagation();
                onCancel();
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isBusy, onCancel]);

    // Lock scroll for the modal's lifetime.
    //
    // This app's `body { overflow-x: hidden }` in index.css forces body's
    // overflow-y to auto too, but `document.scrollingElement` still resolves
    // to `html` — so locking `html.overflow` is what actually prevents the
    // page beneath from scrolling. The scrollbar-width padding on body
    // compensates so a desktop page doesn't shift right when the vertical
    // scrollbar disappears.
    useEffect(() => {
        const { body, documentElement: html } = document;
        const scrollY = window.scrollY;
        const scrollbarWidth = window.innerWidth - html.clientWidth;

        const prevHtmlOverflow = html.style.overflow;
        const prevBodyPaddingRight = body.style.paddingRight;

        html.style.overflow = "hidden";
        if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

        return () => {
            html.style.overflow = prevHtmlOverflow;
            body.style.paddingRight = prevBodyPaddingRight;
            // Belt-and-braces: html.overflow doesn't move scrollY on its
            // own, but if some downstream browser quirk clamped it, this
            // puts things back where the reader left them.
            window.scrollTo(0, scrollY);
        };
    }, []);

    const handleBackdropMouseDown = (
        event: React.MouseEvent<HTMLDivElement>,
    ) => {
        // Only cancel if the mousedown STARTED on the overlay itself — a drag
        // that started inside the card and released on the backdrop should
        // not fire a cancel. Also gated on !isBusy so a mid-write click is
        // ignored, matching the buttons.
        if (event.target === event.currentTarget && !isBusy) {
            onCancel();
        }
    };

    return createPortal(
        <div
            className="confirm-modal-overlay"
            onMouseDown={handleBackdropMouseDown}
        >
            <div
                className="confirm-modal-card"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`${descId}-title`}
                aria-describedby={`${descId}-body`}
                ref={cardRef}
                tabIndex={-1}
            >
                <h2 id={`${descId}-title`} className="confirm-modal-title">
                    {title}
                </h2>
                <div id={`${descId}-body`} className="confirm-modal-body">
                    {prompt}
                </div>
                <div className="confirm-modal-actions">
                    <Button
                        variant="text"
                        label={cancelLabel}
                        onClick={onCancel}
                        disabled={isBusy}
                    />
                    <Button
                        variant={tone === "danger" ? "danger-solid" : "primary"}
                        inline
                        label={isBusy && busyLabel ? busyLabel : confirmLabel}
                        onClick={onConfirm}
                        disabled={isBusy}
                    />
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default ConfirmDialog;
