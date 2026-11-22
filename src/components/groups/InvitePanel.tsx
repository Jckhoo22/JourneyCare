import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Share2 } from "lucide-react";
import "./InvitePanel.css";

import { Button } from "../ui";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/Toast";
import { ensurePublicInfo } from "../../controller/GroupsController";
import type { Group } from "../../model/Group";
import { buildInviteUrl, displayInviteUrl } from "../../lib/inviteUrl";

interface InvitePanelProps {
    group: Group;
}

/** Feature-detect `navigator.share`. Read once at mount. */
const canNativeShare = (): boolean =>
    typeof navigator !== "undefined" && typeof navigator.share === "function";

/**
 * The owner's invite content: QR, link display, and one solid action.
 * [G3, G4, Invite polish]
 *
 * ── What this page IS ─────────────────────────────────────────────────────
 * Two ways to hand the invite over. The QR — for two phones held face to
 * face — is the top half. The action row below carries either a Share
 * button (mobile, opens the OS share sheet) or a Copy button (desktop),
 * with a smaller Copy fallback beside Share so the traditional path is
 * still one tap away on mobile. Exactly one solid teal button per variant
 * (R1).
 *
 * ── What this page is NOT ─────────────────────────────────────────────────
 * A code entry. The "OR ENTER THIS CODE" section is gone — the token is a
 * 32-char hex string, not something anyone reasonably types, and the link
 * is a complete answer to the no-camera case. The chunked-code helper and
 * its copy button went with it.
 *
 * ── URL source ────────────────────────────────────────────────────────────
 * URLs come from `src/lib/inviteUrl.ts`, which anchors the origin to
 * `VITE_APP_ORIGIN` (production host by default) rather than
 * `window.location.origin`. That means a QR rendered on a dev laptop
 * still scans correctly from a phone: the /join/:groupId/:token path is
 * unchanged; only how the URL is built moved.
 *
 * Rendered only for the owner — the token is the capability that lets a
 * stranger request to join, so it must not appear for ordinary members.
 * The screen (pages/GroupInvite) enforces that; this component assumes it.
 */
const InvitePanel = ({ group }: InvitePanelProps) => {
    const { locale } = useLanguage();
    const { addToast } = useToast();

    const [copied, setCopied] = useState(false);
    // Whether the user is on a share-capable device doesn't change during
    // the life of this screen; re-checking would only add jitter across
    // renders. Read once as a lazy state initialiser.
    const [shareAvailable] = useState<boolean>(canNativeShare);

    // Self-healing: groups created before the public window existed have no
    // `public/info`, and an invitee would see "that group no longer exists".
    // The owner opening this screen writes it. Idempotent, and re-syncs both
    // the name and the ownerId — the latter is what a join-request
    // notification is addressed to. [N1]
    useEffect(() => {
        void ensurePublicInfo(group).catch((error: unknown) => {
            console.warn("Could not publish group name:", error);
        });
    }, [group]);

    const inviteUrl = buildInviteUrl(group.id, group.joinToken);
    const shownUrl = displayInviteUrl(group.id, group.joinToken);

    const copyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(inviteUrl);
            setCopied(true);
            addToast(locale.join.copied, "success");
            // Revert the "Copied" state after a beat. Long enough to
            // register as feedback, short enough that a second copy still
            // reads as a new event.
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Non-secure origins and older browsers have no clipboard API.
            addToast(locale.join.copyFailed, "error");
        }
    }, [addToast, inviteUrl, locale]);

    const shareLink = useCallback(async () => {
        try {
            await navigator.share({
                title: locale.join.shareTitle.replace("{group}", group.name),
                url: inviteUrl,
            });
        } catch (error: unknown) {
            // A user-cancelled share throws AbortError — that's not a
            // failure and doesn't deserve a toast. Anything else does.
            const name =
                typeof error === "object" && error && "name" in error
                    ? String((error as { name: unknown }).name)
                    : "";
            if (name !== "AbortError") {
                addToast(locale.join.copyFailed, "error");
            }
        }
    }, [addToast, inviteUrl, group.name, locale]);

    // Groups hand-authored before T4 have no token; a QR built from an empty
    // one would be silently unusable. Say so instead.
    if (!group.joinToken) {
        return (
            <section className="invite-panel">
                <p className="invite-missing">{locale.join.missingToken}</p>
            </section>
        );
    }

    return (
        <section className="invite-panel">
            <p className="invite-body">{locale.join.inviteBody}</p>

            {/* 288px (≥240 polish floor), SVG so it stays crisp at any size,
                plain black on white so styling can't defeat scanning. */}
            <div className="invite-qr">
                <QRCodeSVG
                    value={inviteUrl}
                    size={288}
                    level="M"
                    marginSize={2}
                    bgColor="#ffffff"
                    fgColor="#000000"
                />
            </div>
            <p className="invite-qr-hint">{locale.join.qrHint}</p>

            {/* Truncated URL display. The visible bit tells a shoulder-
                surfing recipient this is a Journey Care invite; the full
                URL only ever leaves this screen through the Share / Copy
                buttons below. `title` carries the full URL for a mouse
                hover on desktop. */}
            <div className="invite-field">
                <span className="invite-label">
                    {locale.join.inviteLinkLabel}
                </span>
                <code className="invite-value" title={inviteUrl}>
                    {shownUrl}
                </code>
            </div>

            {/* Action row. R1: exactly one solid teal button per variant. */}
            <div className="invite-actions">
                {shareAvailable ? (
                    <>
                        <Button
                            variant="primary"
                            icon={Share2}
                            onClick={() => void shareLink()}
                            label={locale.join.shareLink}
                        />
                        <Button
                            variant="secondary"
                            icon={copied ? Check : Copy}
                            onClick={() => void copyLink()}
                            label={
                                copied
                                    ? locale.join.copyLinkDone
                                    : locale.join.copyLink
                            }
                        />
                    </>
                ) : (
                    <Button
                        variant="primary"
                        icon={copied ? Check : Copy}
                        onClick={() => void copyLink()}
                        label={
                            copied
                                ? locale.join.copyLinkDone
                                : locale.join.copyLink
                        }
                    />
                )}
            </div>
        </section>
    );
};

export default InvitePanel;
