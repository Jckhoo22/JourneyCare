import { useId, useMemo, useState } from "react";
import { ChevronDown, Search, Wrench, X } from "lucide-react";
import "./LogHistory.css";

import { useLanguage } from "../../context/LanguageContext";
import { FadeSwap, SkeletonPanel } from "../app_shell/Skeleton";
import { Button, ConfirmDialog } from "../ui";
import { matchesLog } from "../../lib/logSearch";
import {
    formatLogDate,
    logTypeLabel,
    searchableLog,
    type Log,
} from "../../model/Log";
import { formatRinggit } from "../../utils/money";
import { formatOdometer } from "../../model/Car";
import { editLogPath } from "../../constants/routes";

interface LogHistoryProps {
    groupId: string;
    carId: string;
    logs: Log[];
    isLoading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
    error: string | null;
    /** Edit and delete affordances live inside expanded Details. [Car polish] */
    canEdit: boolean;
    onDelete: (log: Log) => void;
    isDeleting: boolean;
}

/**
 * Search only makes sense once there are enough entries for scrolling to be
 * a bother. Below this the list IS the answer. [Car polish]
 */
const SEARCH_THRESHOLD = 8;

/**
 * A car's maintenance history. [L6, Car polish]
 *
 * Newest first, bounded, with an explicit Load older — the same shape the
 * notification list uses, and for the same reason: an unbounded listener
 * over a car's whole history is the read-amplification trap this project
 * has already been bitten by.
 *
 * ── Row grammar ────────────────────────────────────────────────────────────
 * Row = type · date · cost + "Details ▾". No row-level icon buttons — a
 * pencil beside a trash beside a chevron on a phone row is exactly where
 * fat fingers made the wrong tap. Edit + Delete both live INSIDE the
 * expanded Details, as labelled buttons, so the destructive action has
 * context beside it. Delete opens the modal ConfirmDialog, which asks
 * once with a consequence sentence and delegates the actual write.
 *
 * The primary "Log a service" no longer lives here — the sticky bottom
 * bar on CarDetail carries it. One primary per page (R1).
 */
const LogHistory = ({
    groupId,
    carId,
    logs,
    isLoading,
    hasMore,
    onLoadMore,
    error,
    canEdit,
    onDelete,
    isDeleting,
}: LogHistoryProps) => {
    const { locale } = useLanguage();
    const [openId, setOpenId] = useState<string | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const searchId = useId();

    // Memoised on the query and the loaded page, so typing doesn't re-filter
    // on every unrelated re-render the live listener causes.
    const visible = useMemo(
        () => logs.filter((log) => matchesLog(searchableLog(log), query)),
        [logs, query],
    );

    const isSearching = query.trim().length > 0;
    // Search only when the list is long enough that hunting through it is
    // worse than typing. Below the threshold the list IS the search. Stays
    // visible mid-search even if the loaded page dips below (Load older).
    const showSearch = logs.length > SEARCH_THRESHOLD || isSearching;

    return (
        <section className="logs-panel">
            <div className="logs-head">
                <Wrench size={16} strokeWidth={2.5} aria-hidden="true" />
                <h2 className="logs-title">{locale.logs.historyTitle}</h2>
            </div>

            {error && <p className="app-error">{error}</p>}

            {/* Client-side over the loaded page — no query, no reads. [L6]
                See lib/logSearch.ts for why, and for what that costs. */}
            {showSearch && !error && (
                <div className="logs-search">
                    <label className="logs-search-label" htmlFor={searchId}>
                        {locale.logs.searchLabel}
                    </label>
                    <div className="logs-search-field">
                        <Search
                            size={16}
                            strokeWidth={2}
                            className="logs-search-icon"
                            aria-hidden="true"
                        />
                        <input
                            id={searchId}
                            type="search"
                            className="logs-search-input"
                            placeholder={locale.logs.searchPlaceholder}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            autoComplete="off"
                        />
                        {isSearching && (
                            <button
                                type="button"
                                className="logs-search-clear"
                                onClick={() => setQuery("")}
                                aria-label={locale.logs.searchClear}
                            >
                                <X size={16} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>

                    {/* Announced politely so a screen reader hears the count
                        settle instead of every keystroke. */}
                    <p className="logs-search-count" role="status">
                        {isSearching &&
                            (visible.length === 1
                                ? locale.logs.searchCount
                                : locale.logs.searchCountPlural
                            ).replace("{count}", String(visible.length))}
                    </p>
                </div>
            )}

            {!error && (
                <FadeSwap
                    isLoading={isLoading}
                    skeleton={
                        <SkeletonPanel
                            label={locale.logs.loading}
                            rows={3}
                            withTitle={false}
                            bare
                        />
                    }
                >
                    {logs.length === 0 && (
                        <div className="logs-empty">
                            <p className="logs-empty-text">
                                {locale.logs.emptyTitle}
                            </p>
                        </div>
                    )}

                    {/* Nothing matched. Distinct from "no history at all",
                        and it says the search only covered what's loaded — an
                        empty result otherwise reads as "that service never
                        happened". */}
                    {logs.length > 0 && visible.length === 0 && (
                        <div className="logs-empty">
                            <p className="logs-empty-text">
                                {locale.logs.searchEmptyTitle.replace(
                                    "{query}",
                                    query.trim(),
                                )}
                            </p>
                            {hasMore && (
                                <p className="logs-search-scope">
                                    {locale.logs.searchScopeNote}
                                </p>
                            )}
                        </div>
                    )}
                </FadeSwap>
            )}

            {visible.length > 0 && (
                <ul className="logs-list">
                    {visible.map((log) => {
                        const isOpen = openId === log.id;
                        const isConfirming = confirmingId === log.id;
                        const odometer = formatOdometer(log.odometer);
                        const loggedByName =
                            log.createdBy.username || locale.logs.someone;
                        // Every log always has SOMETHING to show in Details
                        // — at minimum the who-logged line — so the toggle
                        // is always available. Edit and Delete are inside
                        // the same disclosure, so a destructive tap always
                        // costs one intentional expand first. [Car polish]
                        const typeLabel = logTypeLabel(log);

                        return (
                            <li key={log.id} className="logs-item">
                                <div className="logs-row">
                                    <div className="logs-main">
                                        <span className="logs-type">
                                            {typeLabel}
                                        </span>
                                        {formatLogDate(log) && (
                                            <span className="logs-meta">
                                                {formatLogDate(log)}
                                            </span>
                                        )}
                                    </div>

                                    <span className="logs-cost">
                                        {formatRinggit(log.cost)}
                                    </span>
                                </div>

                                <div className="logs-actions">
                                    <button
                                        type="button"
                                        className="logs-notes-toggle"
                                        aria-expanded={isOpen}
                                        onClick={() =>
                                            setOpenId(isOpen ? null : log.id)
                                        }
                                    >
                                        <span>{locale.logs.detailsShow}</span>
                                        <ChevronDown
                                            size={14}
                                            strokeWidth={2.5}
                                            className={
                                                isOpen ? "logs-chevron-open" : ""
                                            }
                                        />
                                    </button>
                                </div>

                                {isOpen && (
                                    <div className="logs-details">
                                        {odometer && (
                                            <p className="logs-details-line">
                                                {locale.logs.detailsAtKm.replace(
                                                    "{km}",
                                                    odometer,
                                                )}
                                            </p>
                                        )}
                                        <p className="logs-details-line">
                                            {locale.logs.loggedBy.replace(
                                                "{name}",
                                                loggedByName,
                                            )}
                                        </p>
                                        {log.notes && (
                                            <p className="logs-notes">
                                                {log.notes}
                                            </p>
                                        )}

                                        {/* Edit and Delete live INSIDE the
                                            expansion since the car polish
                                            pass — no row-level icon-only
                                            buttons on the list any more.
                                            Both stay visible while the delete
                                            modal is open above the page. */}
                                        {canEdit && (
                                            <div className="logs-details-actions">
                                                <Button
                                                    variant="secondary"
                                                    inline
                                                    to={editLogPath(
                                                        groupId,
                                                        carId,
                                                        log.id,
                                                    )}
                                                    label={locale.logs.edit}
                                                />
                                                <Button
                                                    variant="text"
                                                    className="logs-delete-btn"
                                                    onClick={() =>
                                                        setConfirmingId(log.id)
                                                    }
                                                    label={locale.logs.delete}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isConfirming && (
                                    <ConfirmDialog
                                        title={locale.logs.deleteTitle}
                                        prompt={locale.logs.deleteConfirm.replace(
                                            "{type}",
                                            typeLabel,
                                        )}
                                        confirmLabel={locale.logs.deleteYes}
                                        cancelLabel={locale.logs.deleteCancel}
                                        onConfirm={() => {
                                            setConfirmingId(null);
                                            onDelete(log);
                                        }}
                                        onCancel={() => setConfirmingId(null)}
                                        isBusy={isDeleting}
                                        busyLabel={locale.common.processing}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Said next to the results too, not only when nothing matched:
                a search that DID find something is exactly when someone
                stops wondering whether it found everything. */}
            {isSearching && hasMore && visible.length > 0 && (
                <p className="logs-search-scope">{locale.logs.searchScopeNote}</p>
            )}

            {hasMore && (
                <Button
                    variant="secondary"
                    inline
                    className="logs-more"
                    onClick={onLoadMore}
                    label={locale.logs.loadMore}
                />
            )}
        </section>
    );
};

export default LogHistory;
