import { useParams } from "react-router";
import "../../styles/app-shell.css";
import "./GroupInvite.css";

import TopBar from "../../components/app_shell/TopBar";
import BackLink from "../../components/BackLink";
import InvitePanel from "../../components/groups/InvitePanel";
import { useAuthController } from "../../controller/AuthController";
import { useGroup } from "../../controller/GroupsController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { isOwner } from "../../model/Group";
import { ROUTES, groupPath } from "../../constants/routes";

/**
 * A group's invitation screen: QR, link and typed code. [G3, G4, Item 4]
 *
 * Owner-only, and enforced here rather than only by hiding the link on the
 * group page — the join token is the capability that lets a stranger request
 * to join, so reaching this URL directly must not reveal it. A non-owner gets
 * a plain explanation instead, not a not-found: they can legitimately see the
 * group, they just can't invite to it.
 */
const GroupInvite = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { logout } = useAuthController();

    const { group, isLoading, notFound } = useGroup(groupId);
    const viewerOwns = group !== null && isOwner(group, user?.uid);

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

                {isLoading && <p className="app-hint">{locale.groups.loading}</p>}

                {!isLoading && notFound && (
                    <div className="app-empty">
                        <h1 className="app-empty-title">
                            {locale.groups.notFoundTitle}
                        </h1>
                        <p className="app-empty-body">
                            {locale.groups.notFoundBody}
                        </p>
                    </div>
                )}

                {/* Member, but not the owner. No token renders on this path. */}
                {!isLoading && group && !viewerOwns && (
                    <div className="app-empty">
                        <h1 className="app-empty-title">
                            {locale.groups.inviteOwnerOnlyTitle}
                        </h1>
                        <p className="app-empty-body">
                            {locale.groups.inviteOwnerOnlyBody}
                        </p>
                    </div>
                )}

                {!isLoading && group && viewerOwns && (
                    <>
                        <header className="invite-head">
                            <h1 className="app-h1">{locale.join.inviteTitle}</h1>
                            <p className="invite-head-group">{group.name}</p>
                        </header>

                        <InvitePanel group={group} />
                    </>
                )}
            </main>
        </div>
    );
};

export default GroupInvite;
