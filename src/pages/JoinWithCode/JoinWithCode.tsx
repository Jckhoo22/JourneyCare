import {
    lazy,
    Suspense,
    useCallback,
    useState,
    type ChangeEvent,
    type FormEvent,
} from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Link2, ScanLine, UserPlus } from "lucide-react";
import "./JoinWithCode.css";

import CardShell from "../../components/app_shell/CardShell";
import { Button, TextField } from "../../components/ui";
import { hasCamera } from "../../utils/camera";
import { useMediaQuery } from "../../utils/useMediaQuery";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/Toast";
import { ROUTES, joinPath } from "../../constants/routes";
import { parseInvite } from "../../utils/inviteLink";

// Keeps html5-qrcode out of the main bundle — see QrScanner.
const QrScanner = lazy(() => import("../../components/qr/QrScanner"));

/**
 * The joiner's entry point, one page in two variants. [G4, platform-adaptive polish]
 *
 * ── Page shape ─────────────────────────────────────────────────────────────
 * Renders on CardShell (same as JoinGroup, CreateGroup): the back link sits
 * INSIDE the centred column, left-aligned to the card's edge, ~12px above
 * it. Not at the viewport corner — the addendum in CardShell's `backLink`
 * prop docs explains why. The card carries icon → title → form.
 *
 * ── canScan ────────────────────────────────────────────────────────────────
 * `getUserMedia` is not enough on its own: laptops technically have a webcam
 * but nobody scans a QR with a laptop lid. So the phone variant only runs
 * when the browser also reads as touch-first — `(pointer: coarse)` or a
 * viewport under 768px. Everything else (desktop, docked tablet on a mouse)
 * gets the paste-only variant.
 *
 * ── What this page NEVER does ───────────────────────────────────────────────
 * Neither variant actually joins. Both funnel through `openInvite`, which
 * parses the link/code and navigates to `/join/:groupId/:token` — the deep
 * link page (JoinGroup) is what runs the join.
 */
const JoinWithCode = () => {
    const { locale } = useLanguage();
    const { addToast } = useToast();
    const navigate = useNavigate();

    // Bias toward paste on desktop even when a webcam exists. Kept in one
    // spot so tweaking the threshold later is a one-line change.
    const isCoarse = useMediaQuery("(pointer: coarse)");
    const isNarrow = useMediaQuery("(max-width: 767px)");
    const canScan = hasCamera() && (isCoarse || isNarrow);

    const [isScanning, setIsScanning] = useState(false);
    // Phone-only: paste is behind a quiet text link so the scan CTA is the
    // one thing on screen by default. Desktop ignores this — paste is the
    // page there.
    const [showPaste, setShowPaste] = useState(false);
    const [pasted, setPasted] = useState("");
    const [pasteError, setPasteError] = useState("");

    /**
     * Single funnel: anything that yields an invite goes through here.
     *
     * `replace: true` because the paste form (and the scan session) are a
     * gate to the invite target, not a page anyone wants to back-arrow
     * into from `/join/:id/:token`. Without replace, pressing back from
     * the join page returns to this form with a stale value in it — the
     * classic "form remains in history behind its destination" trap the
     * nav-loops pass swept out of every post-action navigation.
     */
    const openInvite = useCallback(
        (raw: string): boolean => {
            const parts = parseInvite(raw);
            if (!parts) return false;

            navigate(joinPath(parts.groupId, parts.token), { replace: true });
            return true;
        },
        [navigate],
    );

    const handleScan = useCallback(
        (text: string) => {
            setIsScanning(false);
            if (!openInvite(text)) {
                addToast(locale.join.pasteInvalid, "error");
            }
        },
        [addToast, locale, openInvite],
    );

    const handleScanError = useCallback(() => {
        setIsScanning(false);
        addToast(locale.join.scanDenied, "error");
    }, [addToast, locale]);

    const handlePaste = (event: ChangeEvent<HTMLInputElement>) => {
        setPasted(event.target.value);
        if (pasteError) setPasteError("");
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!openInvite(pasted)) {
            setPasteError(locale.join.pasteInvalid);
        }
    };

    /** Same form on both variants. Whenever it's visible it IS the solid
     *  action — desktop always shows it; phone shows it only after the
     *  user asks for it, and Scan demotes to outline behind it (R1). */
    const renderPasteForm = () => (
        <form className="join-form" onSubmit={handleSubmit} noValidate>
            <TextField
                label={locale.join.pasteLabel}
                placeholder={locale.join.pastePlaceholder}
                type="text"
                icon={Link2}
                value={pasted}
                onChange={handlePaste}
                error={pasteError}
                // Paste-friendly: a URL should not be auto-capitalised,
                // spell-checked, or "corrected" mid-paste.
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
            />
            <Button
                type="submit"
                variant="primary"
                icon={ArrowRight}
                iconTrailing
                label={locale.join.pasteButton}
            />
        </form>
    );

    return (
        <CardShell
            icon={UserPlus}
            title={locale.join.entryTitle}
            subtitle={canScan ? locale.join.askOwnerToShow : undefined}
            backLink={{ to: ROUTES.home, label: locale.common.home }}
        >
            {canScan ? (
                <>
                    {isScanning && (
                        <Suspense
                            fallback={
                                <p className="join-scan-loading">
                                    {locale.common.processing}
                                </p>
                            }
                        >
                            <QrScanner
                                onResult={handleScan}
                                onError={handleScanError}
                            />
                        </Suspense>
                    )}

                    {/* Scan is the SOLID primary until the user opens
                        the paste form, at which point it demotes to
                        outline so exactly one solid button is on the
                        screen at any time (R1). */}
                    <Button
                        variant={showPaste ? "secondary" : "primary"}
                        icon={ScanLine}
                        onClick={() => setIsScanning((on) => !on)}
                        label={
                            isScanning
                                ? locale.join.stopScanning
                                : locale.join.scanButton
                        }
                    />

                    {!showPaste && (
                        <div className="join-have-link">
                            <Button
                                variant="text"
                                onClick={() => setShowPaste(true)}
                                label={locale.join.haveLinkInstead}
                                className="join-have-link-btn"
                            />
                        </div>
                    )}

                    {showPaste && (
                        <div className="join-paste-body">
                            {renderPasteForm()}
                        </div>
                    )}
                </>
            ) : (
                // Desktop variant: paste IS the page. No scan section,
                // no disclosure, no "or" divider — one clear next step.
                <>
                    {renderPasteForm()}
                    <p className="join-onphone-tip">
                        {locale.join.onPhoneTip}
                    </p>
                </>
            )}
        </CardShell>
    );
};

export default JoinWithCode;
