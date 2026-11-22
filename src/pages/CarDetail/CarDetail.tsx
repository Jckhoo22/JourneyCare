import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronRight, PackagePlus, Receipt, Trash2, Wrench } from "lucide-react";
import "../../styles/app-shell.css";
import "./CarDetail.css";

import TopBar from "../../components/app_shell/TopBar";
import BackLink from "../../components/BackLink";
import {
    FadeSwap,
    SkeletonGroupHead,
    SkeletonPanel,
    SkeletonPhotoFrame,
} from "../../components/app_shell/Skeleton";
import { Button, ConfirmDialog } from "../../components/ui";
import CarPhotoPanel from "../../components/cars/CarPhotoPanel";
import CarStats from "../../components/cars/CarStats";
import LogHistory from "../../components/logs/LogHistory";
import MaintenanceSummary from "../../components/due/MaintenanceSummary";
import CarSpend from "../../components/spend/CarSpend";
import ShelfPanel from "../../components/parts/ShelfPanel";
import { useParts } from "../../controller/PartsController";
import { useAuthController } from "../../controller/AuthController";
import { useCar, useCarEditActions } from "../../controller/CarsController";
import { useLogActions, useLogs } from "../../controller/LogsController";
import { useGroup } from "../../controller/GroupsController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import {
    carDisplayName,
    hasCarEdit,
    type Car,
} from "../../model/Car";
import {
    addLogPath,
    addVisitPath,
    editCarPath,
    groupPath,
    ROUTES,
} from "../../constants/routes";

/**
 * Deleting a car takes its whole maintenance history with it, so it is
 * owner-or-creator only and always asks first — the same two-step the group's
 * delete uses. [C8]
 */
const DangerZone = ({
    car,
    onDelete,
    isBusy,
}: {
    car: Car;
    onDelete: (car: Car) => void;
    isBusy: boolean;
}) => {
    const { locale } = useLanguage();
    const [isConfirming, setIsConfirming] = useState(false);

    return (
        <section className="car-danger">
            <h2 className="car-danger-title">{locale.cars.deleteTitle}</h2>

            <p className="car-danger-body">{locale.cars.deleteBody}</p>
            <Button
                variant="danger"
                icon={Trash2}
                inline
                onClick={() => setIsConfirming(true)}
                label={locale.cars.deleteButton}
                disabled={isBusy}
            />

            {isConfirming && (
                <ConfirmDialog
                    title={locale.cars.deleteTitle}
                    prompt={locale.cars.deleteConfirmPrompt.replace(
                        "{car}",
                        carDisplayName(car),
                    )}
                    confirmLabel={locale.cars.deleteConfirmButton}
                    cancelLabel={locale.cars.deleteCancelButton}
                    onConfirm={() => onDelete(car)}
                    onCancel={() => setIsConfirming(false)}
                    isBusy={isBusy}
                    busyLabel={locale.common.processing}
                />
            )}
        </section>
    );
};

/**
 * A car's own page. [C5, C8, C9, C10]
 *
 * Everything here reads from a live listener, so an odometer update or a photo
 * from someone else's phone lands without a reload.
 *
 * ## Order, and what is deliberately absent
 *
 * Photo → service history → what's next → stats → delete.
 *
 * It used to be photo → odometer → what's next → spend → history → details,
 * which put three panels between the photo and the thing people came for. The
 * page answers "what has been done to this car"; the history is that answer,
 * so it sits directly under the picture that identifies the car, and the
 * numbers that support it follow rather than precede it.
 *
 * **There is no details panel.** Brand, model, year, plate, nickname and
 * added-by used to render as a read-only fact grid at the bottom. It was a
 * spec sheet on a page about servicing — every value on it is already either
 * in the header (the nickname IS the h1; make, model and year are the
 * subtitle) or one tap away on the edit screen, which is where you go when you
 * want to change any of them. The plate is the exception and stayed, in the
 * header: it is how you tell two Myvis apart, which is identity rather than
 * detail.
 *
 * The odometer's demotion from a panel to a stat is the other half of the same
 * decision — see `CarStats`. Editing the car is a top-level action and moved
 * to the header; it is not a property of the details section that happened to
 * host its link.
 */
const CarDetail = () => {
    const { groupId, carId } = useParams<{ groupId: string; carId: string }>();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { logout } = useAuthController();
    const navigate = useNavigate();
    const [addingPartFor, setAddingPartFor] = useState<string | null>(null);
    const shelfKey = groupId && carId ? `${groupId}/${carId}` : null;

    const { group } = useGroup(groupId);
    const { car, isLoading, notFound } = useCar(groupId, carId);
    const {
        saveOdometer,
        deleteCar,
        isSaving,
        errors,
        clearError,
    } = useCarEditActions(groupId);

    const {
        logs,
        isLoading: logsLoading,
        hasMore,
        loadMore,
        error: logsError,
    } = useLogs(groupId, carId);
    const { deleteLog, isSaving: isLogSaving } = useLogActions(groupId, carId);
    // Parts shelf [T18]. Own listener; bounded page like the log history.
    const { parts } = useParts(groupId, carId);

    const canEdit =
        car !== null && hasCarEdit(car, user?.uid, group?.ownerId ?? "");
    // Deleting is a bigger act than editing, so it stops at the two people who
    // are actually responsible for the car. [C8]
    const canDelete =
        car !== null &&
        Boolean(user?.uid) &&
        (group?.ownerId === user?.uid || car.createdBy === user?.uid);

    const handleDelete = async (target: Car) => {
        const deleted = await deleteCar(target);
        if (deleted && groupId) navigate(groupPath(groupId), { replace: true });
    };

    return (
        <div className="app-page">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <main className="app-main">
                <TopBar onSignOut={logout} />

                {/* Label = group name so the destination is obvious before
                    tapping. Falls back to "Back" until useGroup resolves —
                    no new read is opened for this. [Polish item 2]

                    Explicit `to={groupPath}` — no more `preferBack`. The
                    smart-pop behaviour caused the "save Edit → back does
                    nothing" loop (Edit saves with `replace`, landing on
                    Car; a pop from Car lands on the pre-Edit Car entry,
                    which is the same URL). The nav-loops pass removed it
                    from BackLink for that reason. Deep-link visitors from
                    notifications still land on this page and back out to
                    the group — that's the correct parent whether they got
                    here in-app or via a shared URL. */}
                <BackLink
                    to={groupId ? groupPath(groupId) : ROUTES.home}
                    label={group?.name}
                />

                {/* Full-page skeleton while the car document loads. Mirrors
                    the final layout — header, photo frame, history and stats
                    panels — so the swap doesn't reflow. [Item 3b] */}
                <FadeSwap
                    isLoading={isLoading}
                    skeleton={
                        <>
                            <SkeletonGroupHead label={locale.cars.loading} />
                            <SkeletonPhotoFrame label={locale.cars.loading} />
                            <SkeletonPanel
                                label={locale.logs.loading}
                                rows={3}
                            />
                            <SkeletonPanel
                                label={locale.cars.loading}
                                rows={2}
                                withTitle={false}
                            />
                        </>
                    }
                >
                    {/* A denied read and a missing car look identical, so this
                        never confirms a car exists to someone outside the group. */}
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

                    {car && groupId && carId && (
                        <>
                        <div className="car-overview">
                            <CarPhotoPanel
                                car={car}
                                editHref={
                                    canEdit
                                        ? editCarPath(groupId, carId)
                                        : undefined
                                }
                            />
                            <div className="car-overview-side">
                                <MaintenanceSummary car={car} groupId={groupId} />

                                {canEdit && (
                                    <nav
                                        className="car-actions"
                                        aria-label={locale.logs.addButton}
                                    >
                                        <Link
                                            to={addLogPath(groupId, carId)}
                                            className="car-actions-item car-actions-link"
                                        >
                                            <span className="car-actions-icon">
                                                <Wrench size={20} strokeWidth={2} />
                                            </span>
                                            <span className="car-actions-body">
                                                <span className="car-actions-title">
                                                    {locale.logs.addButton}
                                                </span>
                                                <span className="car-actions-hint">
                                                    {locale.logs.addHint}
                                                </span>
                                            </span>
                                            <ChevronRight
                                                size={18}
                                                strokeWidth={2.5}
                                                className="car-actions-chevron"
                                            />
                                        </Link>

                                        <Link
                                            to={addVisitPath(groupId, carId)}
                                            className="car-actions-item car-actions-link"
                                        >
                                            <span className="car-actions-icon">
                                                <Receipt size={20} strokeWidth={2} />
                                            </span>
                                            <span className="car-actions-body">
                                                <span className="car-actions-title">
                                                    {locale.logs.visitAddButton}
                                                </span>
                                                <span className="car-actions-hint">
                                                    {locale.logs.visitAddHint}
                                                </span>
                                            </span>
                                            <ChevronRight
                                                size={18}
                                                strokeWidth={2.5}
                                                className="car-actions-chevron"
                                            />
                                        </Link>
                                        <button
                                            type="button"
                                            className="car-actions-item car-actions-link"
                                            onClick={() => setAddingPartFor(shelfKey)}
                                        >
                                            <span className="car-actions-icon">
                                                <PackagePlus size={20} strokeWidth={2} aria-hidden="true" />
                                            </span>
                                            <span className="car-actions-body">
                                                <span className="car-actions-title">{locale.parts.saveButton}</span>
                                                <span className="car-actions-hint">{locale.parts.addSubtitle}</span>
                                            </span>
                                            <ChevronRight
                                                size={18}
                                                strokeWidth={2.5}
                                                className="car-actions-chevron"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </nav>
                                )}
                            </div>
                        </div>

                        {/* Then the history. People open a car to see WHAT
                            WAS DONE to it — the answer is one scroll below
                            "what's next", so both questions get answered
                            before any stats or spend detail. [L6] */}
                        <LogHistory
                            groupId={groupId}
                            carId={carId}
                            logs={logs}
                            isLoading={logsLoading}
                            hasMore={hasMore}
                            onLoadMore={loadMore}
                            error={logsError}
                            canEdit={canEdit}
                            onDelete={(log) => void deleteLog(log)}
                            isDeleting={isLogSaving}
                        />

                        {/* Mileage and lifetime spend, as two small stats of
                            equal weight. [C9, S1] */}
                        <CarStats
                            car={car}
                            canEdit={canEdit}
                            onSaveOdometer={(raw, options) =>
                                saveOdometer(car, raw, options)
                            }
                            isSaving={isSaving}
                            error={errors.odometer}
                            onClearError={() => clearError("odometer")}
                        />

                        {/* The by-type split, summed from the history already
                            loaded above — no reads of its own. [S1] */}
                        <CarSpend
                            car={car}
                            logs={logs}
                            hasMore={hasMore}
                            isLoading={logsLoading}
                        />

                        <ShelfPanel
                            key={shelfKey}
                            groupId={groupId}
                            carId={carId}
                            parts={parts}
                            canEdit={canEdit}
                            isAdding={addingPartFor === shelfKey}
                            onCloseAdd={() => setAddingPartFor(null)}
                        />

                        {/* Says why the controls aren't there, rather than
                            leaving a member wondering. Not a detail — an
                            explanation for an absence, so it outlived the panel
                            that used to house it. [C6] */}
                        {!canEdit && (
                            <p className="car-readonly">
                                {locale.cars.readOnlyNote}
                            </p>
                        )}

                        {canDelete && (
                            <DangerZone
                                car={car}
                                onDelete={handleDelete}
                                isBusy={isSaving}
                            />
                        )}
                        </>
                    )}
                </FadeSwap>
            </main>
        </div>
    );
};

export default CarDetail;
