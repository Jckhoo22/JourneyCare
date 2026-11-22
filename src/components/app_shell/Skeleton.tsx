import { useState, type ReactNode } from "react";
import "./Skeleton.css";

import { useDelayedTrue } from "../../utils/useDelayed";

/**
 * Loading placeholders shaped like the content they stand in for. [Item 3b]
 *
 * A skeleton beats a spinner here because both lists have a known, uniform row
 * shape: the layout settles before the data lands, so nothing jumps when it
 * does. They're `aria-hidden` with a single live-region label on the wrapper —
 * announcing eight fake rows to a screen reader would be worse than silence.
 *
 * ── FadeSwap ────────────────────────────────────────────────────────────────
 * The one place the loading → loaded cross-fade lives. Two rules the wrapper
 * enforces on every caller:
 *
 *   1. A skeleton that flashes for a single frame is worse than none — so it
 *      is only shown after the data has been outstanding for ~150ms. A screen
 *      that loads from Firestore's local cache never sees one.
 *   2. When content arrives, it is wrapped in `.content-enter` (defined in
 *      styles/motion.css) so it eases in over 200ms rather than snapping.
 *      Under `prefers-reduced-motion: reduce` the animation collapses to a
 *      1ms swap — see index.css.
 */

interface SkeletonListProps {
    /** How many placeholder rows. Default matches a typical first screenful. */
    count?: number;
    /** Announced while the real content loads. */
    label: string;
}

interface FadeSwapProps {
    /** True while the caller is still waiting on its data. */
    isLoading: boolean;
    /** Rendered after `delayMs` of sustained loading — never before. */
    skeleton: ReactNode;
    /** Rendered as soon as loading is false, wrapped in `.content-enter`. */
    children: ReactNode;
    /**
     * Suppress the entering animation on the very first paint of a screen
     * that has no skeleton to swap from. Keeps the swap animation for real
     * skeleton → content moments and skips it for instant-cache paints.
     */
    skipInitialAnimation?: boolean;
    /** How long the loading state must persist before a skeleton appears. */
    delayMs?: number;
}

/**
 * Delayed-skeleton, cross-fade content swap. Every screen that waits on a
 * Firestore listener wraps its loading region in one of these — timing and
 * behaviour are identical across the app because there is one implementation.
 */
export const FadeSwap = ({
    isLoading,
    skeleton,
    children,
    skipInitialAnimation = false,
    delayMs = 150,
}: FadeSwapProps) => {
    const showSkeleton = useDelayedTrue(isLoading, delayMs);
    // Latches true the first time the skeleton is shown, so a screen that
    // loaded instantly from cache doesn't get an unnecessary content-enter
    // animation. `setState during render` is the React-recommended way to
    // derive state from another piece of state — see React docs on adjusting
    // state during render.
    const [wasSkeletonShown, setWasSkeletonShown] = useState(false);
    if (showSkeleton && !wasSkeletonShown) {
        setWasSkeletonShown(true);
    }

    if (isLoading) {
        return showSkeleton ? <>{skeleton}</> : null;
    }

    const animate = wasSkeletonShown && !skipInitialAnimation;
    return animate ? (
        <div className="content-enter">{children}</div>
    ) : (
        <>{children}</>
    );
};

/* ── Primitive rows ──────────────────────────────────────────────────────── */

/** Placeholder for the home groups list. Mirrors GroupCard's row. */
export const SkeletonGroupList = ({ count = 3, label }: SkeletonListProps) => (
    <div className="skeleton-list" role="status" aria-label={label}>
        {Array.from({ length: count }, (_, index) => (
            <div className="skeleton-card" key={index} aria-hidden="true">
                <div className="skeleton-box skeleton-avatar" />
                <div className="skeleton-lines">
                    <div className="skeleton-box skeleton-line skeleton-line-title" />
                    <div className="skeleton-box skeleton-line skeleton-line-meta" />
                </div>
            </div>
        ))}
    </div>
);

/** Placeholder for the notification list. Same row shape as a notification. */
export const SkeletonNotificationList = ({
    count = 4,
    label,
}: SkeletonListProps) => (
    <div className="skeleton-list" role="status" aria-label={label}>
        {Array.from({ length: count }, (_, index) => (
            <div className="skeleton-card" key={index} aria-hidden="true">
                <div className="skeleton-box skeleton-avatar skeleton-avatar-sm" />
                <div className="skeleton-lines">
                    <div className="skeleton-box skeleton-line skeleton-line-body" />
                    <div className="skeleton-box skeleton-line skeleton-line-when" />
                </div>
            </div>
        ))}
    </div>
);

/**
 * Placeholder for the group cars list. The car card is a wider row than a
 * group card — 4.5rem × 3rem image slot on the left, meta line under the name
 * — so it gets its own shape rather than borrowing SkeletonGroupList.
 */
export const SkeletonCarList = ({ count = 2, label }: SkeletonListProps) => (
    <div className="skeleton-list" role="status" aria-label={label}>
        {Array.from({ length: count }, (_, index) => (
            <div className="skeleton-card" key={index} aria-hidden="true">
                <div className="skeleton-box skeleton-car-image" />
                <div className="skeleton-lines">
                    <div className="skeleton-box skeleton-line skeleton-line-title" />
                    <div className="skeleton-box skeleton-line skeleton-line-sub" />
                    <div className="skeleton-box skeleton-line skeleton-line-meta" />
                </div>
            </div>
        ))}
    </div>
);

/** Photo-frame placeholder. Reserves the 16:10 slot in --color-accent-tint. */
export const SkeletonPhotoFrame = ({ label }: { label: string }) => (
    <div
        className="skeleton-photo-frame"
        role="status"
        aria-label={label}
        aria-hidden="true"
    />
);

interface SkeletonPanelProps {
    /** Announced while the real content loads. */
    label: string;
    /** How many placeholder rows inside. */
    rows?: number;
    /** Whether to draw a title bar at the top. */
    withTitle?: boolean;
    /**
     * Skip the card chrome (background, border, padding). For skeletons that
     * live INSIDE an existing panel — LogHistory renders inside `.logs-panel`
     * already, and nesting a card inside a card breaks the "no panel inside a
     * panel" rule.
     */
    bare?: boolean;
}

/**
 * Panel placeholder — the shape LogHistory, CarSpend, GroupSpend and DueList
 * share: a card with a title bar and a few text rows inside. Keeps every
 * panel skeleton on one shape so a loading screen doesn't read as a museum
 * of six different placeholder styles.
 */
export const SkeletonPanel = ({
    label,
    rows = 3,
    withTitle = true,
    bare = false,
}: SkeletonPanelProps) => (
    <div
        className={bare ? "skeleton-panel-bare" : "skeleton-panel"}
        role="status"
        aria-label={label}
    >
        {withTitle && (
            <div
                className="skeleton-box skeleton-line skeleton-line-title"
                aria-hidden="true"
            />
        )}
        <div className="skeleton-panel-rows" aria-hidden="true">
            {Array.from({ length: rows }, (_, index) => (
                <div className="skeleton-panel-row" key={index}>
                    <div className="skeleton-box skeleton-line skeleton-line-body" />
                    <div className="skeleton-box skeleton-line skeleton-line-meta" />
                </div>
            ))}
        </div>
    </div>
);

/** The summary strip on home. One head line, a caption, and a few rows. */
export const SkeletonSummaryStrip = ({ label }: { label: string }) => (
    <div className="skeleton-summary" role="status" aria-label={label}>
        <div
            className="skeleton-box skeleton-line skeleton-line-title"
            aria-hidden="true"
        />
        <div
            className="skeleton-box skeleton-line skeleton-line-meta"
            aria-hidden="true"
        />
        <div className="skeleton-summary-rows" aria-hidden="true">
            {Array.from({ length: 2 }, (_, index) => (
                <div className="skeleton-summary-row" key={index}>
                    <div className="skeleton-box skeleton-line skeleton-line-body" />
                    <div className="skeleton-box skeleton-line skeleton-line-when" />
                </div>
            ))}
        </div>
    </div>
);

/** The group header — name, one-line summary. Used while `useGroup` is pending. */
export const SkeletonGroupHead = ({ label }: { label: string }) => (
    <div className="skeleton-head" role="status" aria-label={label}>
        <div
            className="skeleton-box skeleton-line skeleton-head-title"
            aria-hidden="true"
        />
        <div
            className="skeleton-box skeleton-line skeleton-head-meta"
            aria-hidden="true"
        />
    </div>
);
