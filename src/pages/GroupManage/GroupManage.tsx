import { useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronRight, Share2, Type, Users } from "lucide-react";
import "../../styles/app-shell.css";
import "./GroupManage.css";

import TopBar from "../../components/app_shell/TopBar";
import BackLink from "../../components/BackLink";
import { ConfirmDialog, PageTitle } from "../../components/ui";
import {
    FadeSwap,
    SkeletonGroupHead,
    SkeletonPanel,
} from "../../components/app_shell/Skeleton";
import GroupNameEditor from "../../components/groups/GroupNameEditor";
import PendingRequests from "../../components/groups/PendingRequests";
import { useAuthController } from "../../controller/AuthController";
import { useGroup } from "../../controller/GroupsController";
import { usePendingRequests } from "../../controller/JoinController";
import { useRecalculateSpend } from "../../controller/SpendController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { isOwner } from "../../model/Group";
import {
    groupInvitePath,
    groupMembersPath,
    groupPath,
    ROUTES,
} from "../../constants/routes";

/**
 * The group's admin index. [UX phase-2, 2d + hierarchy polish]
 *
 * ── Hierarchy ───────────────────────────────────────────────────────────────
 * One page title ("Manage group"), no duplicated group name at the top —
 * the group name re-enters as the CURRENT-name subtitle of the Group name
 * admin row, and in the BackLink label.
 *
 * ── Row grammar ─────────────────────────────────────────────────────────────
 * Invite, Members and Group name all share one card with hairline dividers,
 * uniform icon + verb-first title + one-line subtitle + right-side
 * affordance. Invite and Members are whole-row taps (chevron). Group name
 * has its own small Rename button — the row's subtitle is the current name,
 * which changes under the user, so the whole row can't be a target.
 *
 * ── Fix totals ──────────────────────────────────────────────────────────────
 * Demoted from a card to a quiet centered link at the bottom of the page —
 * a rare, only-if-a-number-looks-wrong action. Guarded by a ConfirmDialog
 * and disabled while running so a double-tap can't double-fire. The recalc
 * function itself (useRecalculateSpend) is untouched.
 *
 * ── Reads ───────────────────────────────────────────────────────────────────
 * `usePendingRequests` is the only new subscription this page adds, and only
 * for owners. `useRecalculateSpend` is on-demand only (no listener).
 */
const GroupManage = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { logout } = useAuthController();

    const { group, isLoading, notFound } = useGroup(groupId);
    const viewerOwns = group !== null && isOwner(group, user?.uid);
    const { requests } = usePendingRequests(groupId, viewerOwns);
    const { recalculate, isRecalculating } = useRecalculateSpend();

    const [isRenaming, setIsRenaming] = useState(false);
    const [isConfirmingFix, setIsConfirmingFix] = useState(false);

    const handleRecalculate = async () => {
        // Belt-and-suspenders with the `disabled` on the trigger — the
        // dialog's Confirm is disabled too while running, but a stray
        // second call at any layer should still be a no-op.
        if (!group || isRecalculating) return;
        setIsConfirmingFix(false);
        await recalculate(group.id);
    };

    return (
        <div className="app-page">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <main className="app-main">
                <TopBar onSignOut={logout} />

                <BackLink
                    to={groupId ? groupPath(groupId) : ROUTES.home}
                    label={group?.name}
                />

                <FadeSwap
                    isLoading={isLoading}
                    skeleton={
                        <>
                            <SkeletonGroupHead label={locale.groups.loading} />
                            <SkeletonPanel
                                label={locale.groups.loading}
                                rows={2}
                            />
                            <SkeletonPanel
                                label={locale.groups.loading}
                                rows={3}
                            />
                        </>
                    }
                >
                    {notFound && (
                        <div className="app-empty">
                            <h1 className="app-empty-title">
                                {locale.groups.notFoundTitle}
                            </h1>
                            <p className="app-empty-body">
                                {locale.groups.notFoundBody}
                            </p>
                        </div>
                    )}

                    {group && groupId && (
                        <>
                            <PageTitle>{locale.groups.manageTitle}</PageTitle>

                            {/* Owner-only. Stays first, and always renders —
                                the pending banner on GroupDetail deep-links
                                here, so this card is the spatial anchor. Its
                                own empty state carries the reassurance copy. */}
                            {viewerOwns && (
                                <PendingRequests
                                    group={group}
                                    requests={requests}
                                />
                            )}

                            {/* One admin card. Hairline dividers separate
                                the rows; every row shares the identical
                                icon + title + subtitle + chevron grammar
                                in this pass — including Group name, which
                                previously carried a bordered "Rename"
                                button. The row is a button now: tapping
                                it opens the same GroupNameEditor form
                                below. The subtitle stays as the current
                                name (identity, not detail), and the click
                                target is unambiguous — the chevron says
                                "leads somewhere". */}
                            <nav
                                className="manage-nav"
                                aria-label={locale.groups.manageTitle}
                            >
                                {viewerOwns && (
                                    <Link
                                        to={groupInvitePath(groupId)}
                                        className="manage-nav-item manage-nav-link"
                                    >
                                        <span className="manage-nav-icon">
                                            <Share2 size={20} strokeWidth={2} />
                                        </span>
                                        <span className="manage-nav-body">
                                            <span className="manage-nav-title">
                                                {locale.groups.navInvite}
                                            </span>
                                            <span className="manage-nav-hint">
                                                {locale.groups.manageInviteHint}
                                            </span>
                                        </span>
                                        <ChevronRight
                                            size={18}
                                            strokeWidth={2.5}
                                            className="manage-nav-chevron"
                                        />
                                    </Link>
                                )}

                                <Link
                                    to={groupMembersPath(groupId)}
                                    className="manage-nav-item manage-nav-link"
                                >
                                    <span className="manage-nav-icon">
                                        <Users size={20} strokeWidth={2} />
                                    </span>
                                    <span className="manage-nav-body">
                                        <span className="manage-nav-title">
                                            {locale.groups.navMembers}
                                        </span>
                                        <span className="manage-nav-hint">
                                            {locale.groups.manageMembersHint}
                                        </span>
                                    </span>
                                    <ChevronRight
                                        size={18}
                                        strokeWidth={2.5}
                                        className="manage-nav-chevron"
                                    />
                                </Link>

                                {/* Group name row — owner-only chevron row.
                                    Tap opens GroupNameEditor below the
                                    card. Members see a static row with no
                                    chevron and no interaction. */}
                                {viewerOwns ? (
                                    <button
                                        type="button"
                                        className="manage-nav-item manage-nav-link"
                                        onClick={() => setIsRenaming(true)}
                                        aria-expanded={isRenaming}
                                    >
                                        <span className="manage-nav-icon">
                                            <Type size={20} strokeWidth={2} />
                                        </span>
                                        <span className="manage-nav-body">
                                            <span className="manage-nav-title">
                                                {locale.groups.manageNameTitle}
                                            </span>
                                            <span className="manage-nav-hint manage-nav-hint-strong">
                                                {group.name}
                                            </span>
                                        </span>
                                        <ChevronRight
                                            size={18}
                                            strokeWidth={2.5}
                                            className="manage-nav-chevron"
                                        />
                                    </button>
                                ) : (
                                    <div className="manage-nav-item manage-nav-static">
                                        <span className="manage-nav-icon">
                                            <Type size={20} strokeWidth={2} />
                                        </span>
                                        <span className="manage-nav-body">
                                            <span className="manage-nav-title">
                                                {locale.groups.manageNameTitle}
                                            </span>
                                            <span className="manage-nav-hint manage-nav-hint-strong">
                                                {group.name}
                                            </span>
                                        </span>
                                    </div>
                                )}
                            </nav>

                            {/* The rename form opens as its own panel below
                                the admin card — same inline mechanism as
                                before, just no longer swapping an h1. Rename
                                write logic + group_renamed notification flow
                                inside useRenameGroup are untouched. */}
                            {isRenaming && viewerOwns && (
                                <GroupNameEditor
                                    group={group}
                                    onClose={() => setIsRenaming(false)}
                                />
                            )}

                            {/* Fix totals — quiet centered link at the very
                                bottom. Owner-only. The link stays visible
                                while the modal is open, which sits above the
                                page rather than replacing anything in flow. */}
                            {viewerOwns && (
                                <div className="manage-fix">
                                    <button
                                        type="button"
                                        className="manage-fix-link"
                                        onClick={() => setIsConfirmingFix(true)}
                                        disabled={isRecalculating}
                                    >
                                        {isRecalculating
                                            ? locale.spend.recalculateWorking
                                            : locale.groups.fixTotalsLink}
                                    </button>
                                </div>
                            )}

                            {viewerOwns && isConfirmingFix && (
                                <ConfirmDialog
                                    title={locale.spend.recalculateConfirmTitle}
                                    prompt={locale.spend.recalculateConfirmBody}
                                    confirmLabel={locale.spend.recalculate}
                                    cancelLabel={locale.spend.recalculateCancel}
                                    tone="primary"
                                    onConfirm={handleRecalculate}
                                    onCancel={() => setIsConfirmingFix(false)}
                                    isBusy={isRecalculating}
                                    busyLabel={locale.spend.recalculateWorking}
                                />
                            )}
                        </>
                    )}
                </FadeSwap>
            </main>
        </div>
    );
};

export default GroupManage;
