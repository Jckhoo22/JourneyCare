import { useState } from "react";
import { useNavigate } from "react-router";
import {
    UserPlus,
    CircleCheck,
    CircleX,
    UserMinus,
    Pencil,
    KeyRound,
    AlertTriangle,
    CircleAlert,
    Bell,
    Check,
} from "lucide-react";
import "../../styles/app-shell.css";
import "./NotificationsPage.css";

import TopBar from "../../components/app_shell/TopBar";
import BackLink from "../../components/BackLink";
import {
    FadeSwap,
    SkeletonNotificationList,
} from "../../components/app_shell/Skeleton";
import { Button, ConfirmDialog } from "../../components/ui";
import { useAuthController } from "../../controller/AuthController";
import {
    useNotificationActions,
    useNotifications,
} from "../../controller/NotificationsController";
import { useLanguage } from "../../context/LanguageContext";
import {
    formatNotifiedAt,
    type AppNotification,
    type RenderableType,
} from "../../model/Notification";
import {
    ROUTES,
    carPath,
    groupMembersPath,
    groupPath,
} from "../../constants/routes";

/**
 * Formats the "due by" tail of a due-notice sentence in the READER's
 * language. [T19, I18N5]
 *
 * A notification written by a Malay-preference user should still read in
 * Chinese for a Chinese-preference reader — that's the whole point of
 * decision #24. Since T19 due notifications include raw `dueDateMs` /
 * `dueKm` alongside the point-in-time `dueLabel`, we format the raw
 * values with the reader's locale's `byDate`/`atKm` templates.
 *
 * Pre-T19 notifications lack the raw fields and fall through to the
 * stored `dueLabel` — a fixed string in the sender's language at the
 * time. That's the honest fallback; migrating stored data is out of scope
 * (see plan.md § 4 STOP conditions).
 */
const localiseDueLabel = (
    item: AppNotification,
    locale: import("../../locale/English").Locale,
): string => {
    const { dueDateMs, dueKm, dueLabel } = item.payload;
    if (dueDateMs === undefined && dueKm === undefined) {
        return dueLabel ?? "";
    }

    const halves: string[] = [];
    if (dueDateMs !== undefined) {
        const formatted = new Date(dueDateMs).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
        halves.push(locale.due.byDate.replace("{date}", formatted));
    }
    if (dueKm !== undefined) {
        halves.push(locale.due.atKm.replace("{km}", dueKm.toLocaleString()));
    }
    return halves.join(locale.due.join);
};

const ICONS: Record<RenderableType, typeof UserPlus> = {
    join_request: UserPlus,
    request_accepted: CircleCheck,
    request_declined: CircleX,
    removed_from_group: UserMinus,
    group_renamed: Pencil,
    access_changed: KeyRound,
    due_soon: AlertTriangle,
    overdue: CircleAlert,
    // A type this build doesn't know — an old tab across a deploy. [T15]
    unknown: Bell,
};

/** Newest first, bounded, with an explicit Load older. [N4] */
const NotificationsPage = () => {
    const { locale } = useLanguage();
    const { logout } = useAuthController();
    const navigate = useNavigate();

    const { items, isLoading, hasMore, loadMore } = useNotifications();
    const { markRead, markAllRead, deleteNotifications, isBusy } =
        useNotificationActions();

    const unreadCount = items.filter((item) => !item.read).length;

    // ── Select mode ───────────────────────────────────────────────────────
    // Selection is a Set of item ids (not indices) so onSnapshot pruning
    // items — after a delete elsewhere or after our own delete completes —
    // never leaves the wrong rows highlighted.
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [confirmOpen, setConfirmOpen] = useState(false);

    const enterSelect = () => {
        setSelectMode(true);
        setSelectedIds(new Set());
    };

    const exitSelect = () => {
        setSelectMode(false);
        setSelectedIds(new Set());
    };

    const toggleOne = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allSelected = items.length > 0 && selectedIds.size === items.length;
    const toggleAll = () => {
        setSelectedIds(
            allSelected ? new Set() : new Set(items.map((item) => item.id)),
        );
    };

    const runDelete = async () => {
        const targets = items.filter((item) => selectedIds.has(item.id));
        await deleteNotifications(targets);
        setConfirmOpen(false);
        exitSelect();
    };

    const describe = (item: AppNotification): string => {
        // Only the four naming types carry groupName; group_renamed carries the
        // pair of names the rename happened between. [G12]
        const group = item.payload.groupName ?? "a group";

        switch (item.type) {
            // Deliberately renders the names as they were WHEN THIS WAS SENT,
            // not the group's current name — the sentence is about a moment,
            // and refreshing it later would make it untrue. [G12]
            case "group_renamed":
                return locale.notifications.groupRenamed
                    .replace("{username}", item.payload.username ?? "Someone")
                    .replace("{old}", item.payload.oldName ?? "a group")
                    .replace("{new}", item.payload.newName ?? "a new name");

            // One type, two wordings — `granted` carries the direction. [N6]
            case "access_changed":
                return (
                    item.payload.granted
                        ? locale.notifications.accessGranted
                        : locale.notifications.accessRevoked
                )
                    .replace("{car}", item.payload.carName ?? "a car")
                    .replace("{group}", group);
            // The due wording is built here, but the FACTS come from the
            // payload as stamped at the time — nothing is re-derived from the
            // car's current intervals. [R4]
            case "due_soon":
            case "overdue":
                return (
                    item.type === "overdue"
                        ? locale.notifications.overdue
                        : locale.notifications.dueSoon
                )
                    .replace("{type}", item.payload.typeLabel ?? "A service")
                    .replace("{car}", item.payload.carName ?? "a car")
                    // [T19, I18N5] Prefer raw params, formatted in the
                    // reader's language. Falls back to the point-in-time
                    // stored dueLabel for pre-T19 notifications.
                    .replace("{due}", localiseDueLabel(item, locale));

            case "join_request":
                return locale.notifications.joinRequest
                    .replace("{username}", item.payload.username ?? "Someone")
                    .replace("{group}", group);
            case "request_accepted":
                return locale.notifications.requestAccepted.replace(
                    "{group}",
                    group,
                );
            case "request_declined":
                return locale.notifications.requestDeclined.replace(
                    "{group}",
                    group,
                );
            case "removed_from_group":
                return locale.notifications.removedFromGroup.replace(
                    "{group}",
                    group,
                );

            // A type this build predates. Says the one thing it can still
            // truthfully say rather than guessing at a wording. [T15]
            case "unknown":
                return locale.notifications.unknown.replace("{group}", group);
        }
    };

    /**
     * Tapping marks read and opens the thing it is about. [N3, T15]
     *
     * "The thing it is about" is the whole point of this function, and it is
     * not always the group:
     *
     *   join_request      → the MEMBERS screen, because the owner's next move
     *                       is Accept or Decline and that is where the pending
     *                       list lives. The group page would make them go
     *                       looking for it.
     *   due / access      → that CAR. A message naming one car that drops you
     *                       on a list of cars has made you do the finding.
     *   declined / removed → NOWHERE. Both are messages to somebody who is not
     *                       in the group, so every destination inside it
     *                       resolves to "not found" — which reads as a broken
     *                       link rather than as the answer. The row still
     *                       marks itself read, so the badge clears.
     *
     * Everything else opens the group.
     *
     * Nothing here checks that the target still exists, deliberately: that
     * would cost a read per tap to pre-empt a screen the group and car pages
     * already handle. A deleted target lands on their "no longer exists" state
     * — see the notFound branches in GroupDetail, CarDetail and GroupMembers.
     */
    const handleOpen = async (item: AppNotification) => {
        await markRead(item);

        const { groupId, carId } = item.payload;
        if (!groupId) return;

        // Nothing inside the group is readable to them any more.
        if (item.type === "removed_from_group" || item.type === "request_declined") {
            return;
        }

        if (item.type === "join_request") {
            navigate(groupMembersPath(groupId));
            return;
        }

        if (carId) {
            navigate(carPath(groupId, carId));
            return;
        }

        navigate(groupPath(groupId));
    };

    return (
        <div className="app-page">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <main className="app-main">
                <TopBar onSignOut={logout} />

                <BackLink to={ROUTES.home} label={locale.common.home} />

                <div className="notifications-head">
                    <h1 className="app-h1">{locale.notifications.title}</h1>
                    <div className="notifications-head-actions">
                        {selectMode ? (
                            <Button
                                variant="text"
                                className="notifications-mark-all"
                                onClick={exitSelect}
                                disabled={isBusy}
                                label={locale.notifications.selectCancel}
                            />
                        ) : (
                            <>
                                {items.length > 0 && (
                                    <Button
                                        variant="text"
                                        className="notifications-mark-all"
                                        onClick={enterSelect}
                                        label={locale.notifications.selectStart}
                                    />
                                )}
                                {unreadCount > 0 && (
                                    <Button
                                        variant="text"
                                        className="notifications-mark-all"
                                        onClick={() => markAllRead(items)}
                                        disabled={isBusy}
                                        label={locale.notifications.markAllRead}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>

                {selectMode && items.length > 0 && (
                    <div className="notifications-selectbar">
                        <Button
                            variant="text"
                            onClick={toggleAll}
                            disabled={isBusy}
                            label={
                                allSelected
                                    ? locale.notifications.deselectAll
                                    : locale.notifications.selectAll
                            }
                        />
                        <Button
                            variant="danger-solid"
                            inline
                            onClick={() => setConfirmOpen(true)}
                            disabled={selectedIds.size === 0 || isBusy}
                            label={locale.notifications.deleteCount.replace(
                                "{count}",
                                String(selectedIds.size),
                            )}
                        />
                    </div>
                )}

                {/* Skeleton rows rather than a spinner, delayed 150ms so a
                    cache hit doesn't flash. [Item 3b] */}
                <FadeSwap
                    isLoading={isLoading}
                    skeleton={
                        <SkeletonNotificationList
                            label={locale.notifications.loading}
                        />
                    }
                >
                    {items.length === 0 && (
                        <div className="app-empty">
                            <h2 className="app-empty-title">
                                {locale.notifications.emptyTitle}
                            </h2>
                            <p className="app-empty-body">
                                {locale.notifications.emptyBody}
                            </p>
                        </div>
                    )}

                    {items.length > 0 && (
                        <ul className="notifications-list stagger-in">
                            {items.map((item) => {
                                const Icon = ICONS[item.type];
                                const isSelected = selectedIds.has(item.id);
                                const rowClasses = [
                                    "notifications-item",
                                    item.read ? "" : "notifications-unread",
                                    selectMode && isSelected
                                        ? "notifications-selected"
                                        : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ");

                                return (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            className={rowClasses}
                                            onClick={() =>
                                                selectMode
                                                    ? toggleOne(item.id)
                                                    : handleOpen(item)
                                            }
                                            aria-pressed={
                                                selectMode ? isSelected : undefined
                                            }
                                        >
                                            {selectMode && (
                                                <span
                                                    className={
                                                        isSelected
                                                            ? "notifications-checkbox checked"
                                                            : "notifications-checkbox"
                                                    }
                                                    aria-hidden="true"
                                                >
                                                    {isSelected && (
                                                        <Check
                                                            size={14}
                                                            strokeWidth={3}
                                                        />
                                                    )}
                                                </span>
                                            )}
                                            <span className="notifications-icon">
                                                <Icon size={18} strokeWidth={2} />
                                            </span>
                                            <span className="notifications-body">
                                                <span className="notifications-text">
                                                    {describe(item)}
                                                </span>
                                                <span className="notifications-when">
                                                    {formatNotifiedAt(item)}
                                                </span>
                                            </span>
                                            {!item.read && !selectMode && (
                                                <span
                                                    className="notifications-dot"
                                                    aria-hidden="true"
                                                />
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </FadeSwap>

                {hasMore && (
                    <Button
                        variant="secondary"
                        inline
                        className="notifications-more"
                        onClick={loadMore}
                        label={locale.notifications.loadMore}
                    />
                )}
            </main>

            {confirmOpen && (
                <ConfirmDialog
                    title={locale.notifications.deleteTitle}
                    prompt={
                        selectedIds.size === 1
                            ? locale.notifications.deletePromptOne
                            : locale.notifications.deletePrompt.replace(
                                  "{count}",
                                  String(selectedIds.size),
                              )
                    }
                    confirmLabel={
                        selectedIds.size === 1
                            ? locale.notifications.deleteConfirmOne
                            : locale.notifications.deleteConfirm.replace(
                                  "{count}",
                                  String(selectedIds.size),
                              )
                    }
                    cancelLabel={locale.notifications.selectCancel}
                    onConfirm={runDelete}
                    onCancel={() => setConfirmOpen(false)}
                    isBusy={isBusy}
                    busyLabel={locale.notifications.deleting}
                />
            )}
        </div>
    );
};

export default NotificationsPage;
