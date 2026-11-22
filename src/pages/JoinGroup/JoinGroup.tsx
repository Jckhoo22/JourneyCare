import { useParams } from "react-router";
import {
    Users,
    ArrowRight,
    CircleAlert,
    CircleCheck,
    Clock,
    Unlink,
} from "lucide-react";
import "./JoinGroup.css";

import CardShell from "../../components/app_shell/CardShell";
import { Button } from "../../components/ui";
import { useInvite, type InviteState } from "../../controller/JoinController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { ROUTES, groupPath } from "../../constants/routes";

/**
 * The invite deep link. [G5]
 *
 * Reached from a tapped link or a scanned QR — scanning navigates here rather
 * than running its own logic, so both share exactly this path. Signing in is
 * handled upstream by the route guard, which returns the visitor to this URL.
 *
 * ── Shell ─────────────────────────────────────────────────────────────────
 * A "true door" per the CardShell BackLink addendum: this is the first URL a
 * fresh visitor encounters when a family member shares an invite. Stays on
 * CardShell; the back link is conditional on being signed in — a fresh
 * signed-out arrival from WhatsApp has no in-app somewhere to go back to,
 * and "Home" for them resolves to the sign-in gate, an escape into nothing
 * on the single most important screen of their onboarding. `RequireVerified`
 * currently redirects signed-out users through auth first, so the
 * conditional is defensive; still worth honest render logic in case the
 * guard ever loosens.
 */
const JoinGroup = () => {
    const { groupId, token } = useParams<{ groupId: string; token: string }>();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { state, groupName, requestToJoin, isSubmitting } = useInvite(
        groupId,
        token,
    );

    const icons: Record<InviteState, typeof Users> = {
        loading: Users,
        valid: Users,
        "invalid-link": Unlink,
        "group-missing": Unlink,
        "already-member": CircleCheck,
        "already-pending": Clock,
        rejected: CircleAlert,
        error: CircleAlert,
    };

    // Every state names its own cause. None of them says "expired": join tokens
    // do not expire (G3), and saying so would hide the real problem.
    const headings: Record<InviteState, { title: string; body: string }> = {
        loading: { title: locale.join.joinTitle, body: locale.join.checking },
        valid: { title: locale.join.joinPrompt, body: "" },
        "invalid-link": {
            title: locale.join.invalidLinkTitle,
            body: locale.join.invalidLinkBody,
        },
        "group-missing": {
            title: locale.join.groupMissingTitle,
            body: locale.join.groupMissingBody,
        },
        "already-member": {
            title: locale.join.alreadyMemberTitle,
            body: locale.join.alreadyMemberBody,
        },
        "already-pending": {
            title: locale.join.alreadyPendingTitle,
            body: locale.join.alreadyPendingBody,
        },
        rejected: {
            title: locale.join.rejectedTitle,
            body: locale.join.rejectedBody,
        },
        error: { title: locale.join.errorTitle, body: locale.join.errorBody },
    };

    const heading = headings[state];
    const showsName =
        groupName !== "" && (state === "valid" || state === "already-member");

    return (
        <CardShell
            icon={icons[state]}
            title={heading.title}
            subtitle={heading.body || undefined}
            backLink={
                user
                    ? { to: ROUTES.home, label: locale.common.home }
                    : undefined
            }
        >
            {showsName && (
                <div className="join-group-name animate-fade-in">{groupName}</div>
            )}

            {state === "valid" && (
                <>
                    {/* Under the group name, above the ask-to-join
                        button: says what happens after the tap so
                        Auntie's first screen isn't a bare CTA she has
                        to interpret. [UX tidy pass, audit 3 § 17] */}
                    <p className="join-prompt-hint">
                        {locale.join.joinPromptHint}
                    </p>
                    <Button
                        variant="primary"
                        icon={isSubmitting ? undefined : ArrowRight}
                        iconTrailing
                        onClick={requestToJoin}
                        disabled={isSubmitting}
                        label={
                            isSubmitting
                                ? locale.common.processing
                                : locale.join.requestButton
                        }
                    />
                </>
            )}

            {state === "already-member" && groupId && (
                <Button
                    variant="primary"
                    className="join-link"
                    icon={ArrowRight}
                    iconTrailing
                    to={groupPath(groupId)}
                    label={locale.join.openGroup}
                />
            )}
        </CardShell>
    );
};

export default JoinGroup;
