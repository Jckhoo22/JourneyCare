import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Trash2, LogOut } from "lucide-react";
import "../../styles/app-shell.css";
import "./GroupMembers.css";

import TopBar from "../../components/app_shell/TopBar";
import BackLink from "../../components/BackLink";
import {
    FadeSwap,
    SkeletonGroupHead,
    SkeletonPanel,
} from "../../components/app_shell/Skeleton";
import { Button, ConfirmDialog } from "../../components/ui";
import PeoplePanel from "../../components/groups/PeoplePanel";
import { useAuthController } from "../../controller/AuthController";
import {
    useCarAdderActions,
    useGroup,
    useGroupActions,
    useMemberActions,
} from "../../controller/GroupsController";
import { useCarAccessActions, useCars } from "../../controller/CarsController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { isOwner, type MemberEntry } from "../../model/Group";
import type { Car } from "../../model/Car";
import { ROUTES, groupInvitePath, groupPath } from "../../constants/routes";

/**
 * A group's members screen. [G6, G7, G9, G10, G11, UX phase-2]
 *
 * Members panel + the per-car access grid + the one destructive action each
 * role has (delete for the owner, leave for everyone else).
 *
 * ── History ────────────────────────────────────────────────────────────────
 * The pending-requests panel used to live here too. In UX phase-2 it moved
 * to /manage, where the rest of the admin surfaces gathered — and where the
 * pending badge on GroupDetail's "Manage group" link now points. The
 * listener moved with the panel; this screen no longer subscribes to it.
 */
const GroupMembers = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { logout } = useAuthController();
    const navigate = useNavigate();

    const { group, isLoading, notFound } = useGroup(groupId);
    const { deleteGroup, isSaving } = useGroupActions();
    const { removeMember, leaveGroup, busyUid } = useMemberActions();
    const { setCarAdder } = useCarAdderActions();
    const { cars } = useCars(groupId);
    const { setCarEdit, setCarEditBulk, bulkBusyUid } =
        useCarAccessActions(groupId);

    // Two-step: the button arms the confirmation, it never acts. [G11]
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isConfirmingLeave, setIsConfirmingLeave] = useState(false);

    const viewerOwns = group !== null && isOwner(group, user?.uid);

    const handleDelete = async () => {
        if (!groupId) return;

        const deleted = await deleteGroup(groupId);
        if (deleted) navigate(ROUTES.home, { replace: true });
    };

    const handleRemove = (member: MemberEntry) => {
        if (!group) return;
        void removeMember(group, member.uid, member.username);
    };

    // The three access-toggle handlers all resolve to the write's success —
    // the debounced switch in PeoplePanel needs the answer so it can revert
    // its optimistic flip on failure. Toasting lives inside the wrapper
    // cells, keyed by kind so a rapid burst doesn't stack.
    const handleToggleCarAdder = async (
        member: MemberEntry,
        allowed: boolean,
    ): Promise<boolean> => {
        if (!group) return false;
        return setCarAdder(group, member.uid, allowed);
    };

    const handleToggleCarEdit = async (
        car: Car,
        uid: string,
        allowed: boolean,
    ): Promise<boolean> => {
        if (!group) return false;
        return setCarEdit(group, car, uid, allowed);
    };

    const handleBulkEdit = async (
        member: MemberEntry,
        allowed: boolean,
    ): Promise<boolean> => {
        if (!group) return false;
        return setCarEditBulk(group, cars, member.uid, allowed);
    };

    // Leaving revokes our own read access, so the listener would start failing.
    // Go home immediately rather than sitting on a group we can no longer see.
    const handleLeave = async () => {
        if (!group || !user?.uid) return;

        const left = await leaveGroup(group, user.uid);
        if (left) navigate(ROUTES.home, { replace: true });
    };

    return (
        <div className="app-page">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <main className="app-main">
                <TopBar onSignOut={logout} />

                {/* Explicit `to={groupPath}` — no more `preferBack`. The
                    group's own page is the correct parent whether the
                    user arrived here in-app or via a join-request
                    notification deep link. See BackLink.tsx for why the
                    smart-pop behaviour was removed. */}
                <BackLink
                    to={groupId ? groupPath(groupId) : ROUTES.home}
                    label={group?.name}
                />

                {/* Full-page skeleton while the group loads. [Item 3b] */}
                <FadeSwap
                    isLoading={isLoading}
                    skeleton={
                        <>
                            <SkeletonGroupHead label={locale.groups.loading} />
                            <SkeletonPanel
                                label={locale.members.title}
                                rows={3}
                            />
                            <SkeletonPanel
                                label={locale.members.title}
                                rows={2}
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

                    {group && (
                        <>
                        {/* Header. The back link above already carries the
                            group name; a second subtitle line was pure
                            duplication. The member count moves inline
                            with the title as a muted counter so a reader
                            can see roster size without scanning the list. */}
                        <header className="members-head">
                            <h1 className="app-h1">
                                {locale.members.title}
                                {/* Dot as its own span so it gets explicit
                                    horizontal margin on both sides — JSX
                                    text-node whitespace in the sans-serif
                                    count font is narrower than the display
                                    font next to it and reads as touching
                                    the title. `aria-hidden` on the dot
                                    keeps the announced text "Members 2"
                                    rather than "Members middot 2". */}
                                <span
                                    className="members-count-dot"
                                    aria-hidden="true"
                                >
                                    ·
                                </span>
                                <span className="members-count">
                                    {group.memberIds.length}
                                </span>
                            </h1>
                        </header>

                        {/* Person-centric card: one row-group per member,
                            merging identity + group-level permission + bulk
                            "edit all cars" (derived) + per-car disclosure.
                            [polish, C1, C6, C7] */}
                        <PeoplePanel
                            group={group}
                            cars={cars}
                            canManage={viewerOwns}
                            onRemove={handleRemove}
                            busyUid={busyUid}
                            onToggleCarAdder={handleToggleCarAdder}
                            onTogglePerCar={handleToggleCarEdit}
                            onBulkEdit={handleBulkEdit}
                            bulkBusyUid={bulkBusyUid}
                            invitePath={
                                viewerOwns && groupId
                                    ? groupInvitePath(groupId)
                                    : undefined
                            }
                        />

                        {/* Owner only — and the rules refuse anyone else even if
                            they reach the call another way. [G11]

                            "Danger zone" became "Delete group" in this pass:
                            the surrounding heading is the action, not a
                            temperature. The ConfirmDialog now names the
                            group and the whole consequence (all its cars and
                            every log for everyone) so the confirm-tap is not
                            a shortcut past reading it. */}
                        {viewerOwns && (
                            <section className="group-danger">
                                <h2 className="group-danger-title">
                                    {locale.groups.deleteTitle}
                                </h2>

                                <p className="group-danger-body">
                                    {locale.groups.deleteBody}
                                </p>
                                <Button
                                    variant="danger"
                                    inline
                                    icon={Trash2}
                                    onClick={() => setIsConfirmingDelete(true)}
                                    label={locale.groups.deleteButton}
                                    disabled={isSaving}
                                />

                                {isConfirmingDelete && (
                                    <ConfirmDialog
                                        title={locale.groups.deleteTitle}
                                        prompt={locale.groups.deleteConfirmPrompt.replace(
                                            "{name}",
                                            group.name,
                                        )}
                                        confirmLabel={locale.groups.deleteConfirmButton}
                                        cancelLabel={locale.groups.deleteCancelButton}
                                        onConfirm={handleDelete}
                                        onCancel={() => setIsConfirmingDelete(false)}
                                        isBusy={isSaving}
                                        busyLabel={locale.common.processing}
                                    />
                                )}
                            </section>
                        )}

                        {/* Non-owners only. The owner has no Leave: a group
                            always has an owner, so their exit is delete. [G10] */}
                        {!viewerOwns && (
                            <section className="group-danger">
                                <h2 className="group-danger-title">
                                    {locale.members.leaveTitle}
                                </h2>

                                <p className="group-danger-body">
                                    {locale.members.leaveBody}
                                </p>
                                <Button
                                    variant="danger"
                                    inline
                                    icon={LogOut}
                                    onClick={() => setIsConfirmingLeave(true)}
                                    label={locale.members.leaveButton}
                                    disabled={busyUid !== null}
                                />

                                {isConfirmingLeave && (
                                    <ConfirmDialog
                                        title={locale.members.leaveTitle}
                                        prompt={locale.members.leaveConfirm}
                                        confirmLabel={locale.members.leaveYes}
                                        cancelLabel={locale.members.cancel}
                                        onConfirm={handleLeave}
                                        onCancel={() => setIsConfirmingLeave(false)}
                                        isBusy={busyUid !== null}
                                        busyLabel={locale.common.processing}
                                    />
                                )}
                            </section>
                        )}
                        </>
                    )}
                </FadeSwap>
            </main>
        </div>
    );
};

export default GroupMembers;
