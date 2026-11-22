import { Link, useParams } from "react-router";
import { Car, Plus, Settings2, UserPlus } from "lucide-react";
import "../../styles/app-shell.css";
import "./GroupDetail.css";

import TopBar from "../../components/app_shell/TopBar";
import BackLink from "../../components/BackLink";
import {
    FadeSwap,
    SkeletonCarList,
    SkeletonGroupHead,
} from "../../components/app_shell/Skeleton";
import { Button, EmptyState, PageTitle } from "../../components/ui";
import CarCard from "../../components/cars/CarCard";
import WhatsDue from "../../components/due/WhatsDue";
import GroupSpend from "../../components/spend/GroupSpend";
import { useAuthController } from "../../controller/AuthController";
import { useCars } from "../../controller/CarsController";
import { useGroup } from "../../controller/GroupsController";
import { usePendingRequests } from "../../controller/JoinController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { canAddCars, isOwner, memberCount } from "../../model/Group";
import {
    ROUTES,
    addCarPath,
    groupManagePath,
} from "../../constants/routes";

/**
 * A group's home — the cars space. [G2, UX phase-2, 2d]
 *
 * The prompt's Sign-off #5 rewired this page around three moves:
 *   — Nav rows (Members, Invitation) and the rename pencil are gone;
 *     they live on the new /manage screen now.
 *   — Fix-totals moved out of GroupSpend's menu onto /manage too.
 *   — Pending join requests surface HERE via a badge on the "Manage
 *     group" link, so a new request is never hidden behind the admin
 *     screen.
 *
 * The read-amplification cost of the badge is one owner-only bounded
 * `usePendingRequests` subscription. Same shape the members screen used
 * to run; it moved with the panel it drives.
 *
 * The URL is unchanged (`/groups/{id}`), so every invite link,
 * notification target and bookmark minted before this reorder still
 * resolves.
 */
const GroupDetail = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { logout } = useAuthController();

    const { group, isLoading, notFound } = useGroup(groupId);
    const { cars, isLoading: carsLoading, error: carsError } = useCars(groupId);

    const viewerOwns = group !== null && isOwner(group, user?.uid);
    const mayAddCar = group !== null && canAddCars(group, user?.uid);

    // The badge on the Manage link. Owner-only, empty for members. [Sign-off #5]
    const { requests } = usePendingRequests(groupId, viewerOwns);
    const pendingCount = requests.length;

    const count = group ? memberCount(group) : 0;
    const countLabel = (
        count === 1 ? locale.home.memberCount : locale.home.memberCountPlural
    ).replace("{count}", String(count));

    const pendingBannerText = viewerOwns && pendingCount > 0
        ? (pendingCount === 1
              ? locale.groups.pendingBannerOne
              : locale.groups.pendingBannerMany
          ).replace("{count}", String(pendingCount))
        : "";

    return (
        <div className="app-page">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <main className="app-main">
                <TopBar onSignOut={logout} />

                {/* Explicit `to={home}` — no more `preferBack`. Home is
                    the parent of every group's front door whether the user
                    arrived in-app or via a deep link, and the smart-pop
                    behaviour it replaced was the source of the nav-loop
                    class of bugs (see BackLink.tsx). */}
                <BackLink to={ROUTES.home} label={locale.common.home} />

                <FadeSwap
                    isLoading={isLoading}
                    skeleton={
                        <>
                            <SkeletonGroupHead label={locale.groups.loading} />
                            <SkeletonCarList
                                count={2}
                                label={locale.cars.loading}
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
                            {/* Title row: name + owner-only Manage. Rename
                                lives on /manage; the day-to-day view isn't
                                cluttered by an owner-only pencil. The Manage
                                button is a quiet secondary so "Add car" stays
                                the primary action on the page. [UX 2d, polish] */}
                            <header className="group-head">
                                <div className="group-head-row">
                                    <PageTitle>{group.name}</PageTitle>
                                    {viewerOwns && (
                                        <Link
                                            to={groupManagePath(groupId)}
                                            className="group-manage-btn"
                                            aria-label={locale.groups.manageEntry}
                                        >
                                            <Settings2
                                                size={16}
                                                strokeWidth={2}
                                                aria-hidden="true"
                                            />
                                            <span>{locale.groups.manageEntry}</span>
                                            {pendingCount > 0 && (
                                                <span
                                                    className="group-manage-dot"
                                                    aria-hidden="true"
                                                />
                                            )}
                                        </Link>
                                    )}
                                </div>
                                <p className="group-summary">
                                    <span>{countLabel}</span>
                                    <span
                                        className="group-summary-dot"
                                        aria-hidden="true"
                                    >
                                        ·
                                    </span>
                                    <span>
                                        {viewerOwns
                                            ? locale.groups.summaryOwner
                                            : locale.groups.summaryMember}
                                    </span>
                                </p>
                            </header>

                            {/* Owner-only amber banner — a new join request is
                                surfaced right on the page rather than only via
                                the dot on Manage. Reuses the pending listener
                                already running above; no extra reads. */}
                            {viewerOwns && pendingCount > 0 && (
                                <Link
                                    to={groupManagePath(groupId)}
                                    className="group-pending-banner"
                                >
                                    <span
                                        className="group-pending-icon"
                                        aria-hidden="true"
                                    >
                                        <UserPlus size={18} strokeWidth={2.25} />
                                    </span>
                                    <span className="group-pending-text">
                                        {pendingBannerText}
                                    </span>
                                    <span className="group-pending-action">
                                        {locale.groups.pendingBannerAction}
                                    </span>
                                </Link>
                            )}

                            {/* What's due first — a phone lands on the thing
                                that wants doing, not on a nav row. [R3] */}
                            {!carsLoading && !carsError && (
                                <WhatsDue
                                    groupId={groupId}
                                    cars={cars}
                                />
                            )}

                            {/* The cars space, then. [C10, Group polish]
                                Section header is a plain muted label —
                                the count was redundant with the list
                                itself, and the icon added chrome on a
                                page whose whole content IS cars. Add
                                car is DEMOTED to a quiet dashed row
                                appended to the list once cars exist;
                                only at zero cars does it keep its
                                prominent primary form as the empty-state
                                CTA. Adding a car is not the primary
                                thing you came here to do once you have
                                one — you came to check on the cars you
                                already have. */}
                            <section
                                className="group-cars"
                                aria-labelledby="cars-heading"
                            >
                                <h2
                                    id="cars-heading"
                                    className="group-cars-label"
                                >
                                    {locale.cars.sectionTitle}
                                </h2>

                                {carsError && (
                                    <p className="app-error">{carsError}</p>
                                )}

                                {!carsError && (
                                    <FadeSwap
                                        isLoading={carsLoading}
                                        skeleton={
                                            <SkeletonCarList
                                                count={2}
                                                label={locale.cars.loading}
                                            />
                                        }
                                    >
                                        {cars.length > 0 && (
                                            <div className="group-cars-list stagger-in">
                                                {cars.map((car) => (
                                                    <CarCard
                                                        key={car.id}
                                                        car={car}
                                                        groupId={groupId}
                                                    />
                                                ))}
                                                {mayAddCar && (
                                                    <Link
                                                        to={addCarPath(groupId)}
                                                        className="group-cars-add"
                                                    >
                                                        <Plus
                                                            size={16}
                                                            strokeWidth={2}
                                                            aria-hidden="true"
                                                        />
                                                        <span>
                                                            {locale.cars.addButton}
                                                        </span>
                                                    </Link>
                                                )}
                                            </div>
                                        )}
                                        {cars.length === 0 && (
                                            <EmptyState
                                                icon={Car}
                                                title={locale.cars.emptyTitle}
                                                body={
                                                    mayAddCar
                                                        ? locale.cars.emptyBody
                                                        : locale.cars.emptyBodyReadOnly
                                                }
                                                action={
                                                    mayAddCar && groupId ? (
                                                        <Button
                                                            variant="primary"
                                                            icon={Plus}
                                                            to={addCarPath(groupId)}
                                                            label={locale.cars.addButton}
                                                        />
                                                    ) : undefined
                                                }
                                            />
                                        )}
                                    </FadeSwap>
                                )}
                            </section>

                            {/* Spending closes the page — a reference figure,
                                not something that wants action. Fix totals
                                moved onto /manage. [S1] */}
                            {!carsLoading && !carsError && group && (
                                <GroupSpend
                                    groupId={groupId}
                                    group={group}
                                    cars={cars}
                                />
                            )}
                        </>
                    )}
                </FadeSwap>
            </main>
        </div>
    );
};

export default GroupDetail;
