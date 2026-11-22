import { Link } from "react-router";
import { AlertTriangle, Check, Wallet } from "lucide-react";
import "./SummaryStrip.css";

import { useLanguage } from "../../context/LanguageContext";
import { groupPath } from "../../constants/routes";
import { EMPTY_TALLY, tallyTotal, type DueTally } from "../../lib/nextDue";
import { spendInYear, type Group } from "../../model/Group";
import { currentYear } from "../../lib/spend";
import { formatRinggit } from "../../utils/money";
import { carDisplayName, type Car } from "../../model/Car";
import { dueForCar, dueTypeLabel } from "../../model/Due";
import { needsAttention } from "../../lib/nextDue";

interface SummaryStripProps {
    groups: Group[];
    byGroup: Record<string, DueTally>;
    total: DueTally;
    /** Cars-by-group, same map Home already holds. Used for the Zone A
     *  nearest-item support line — no new subscription. */
    carsByGroup?: Record<string, Car[]>;
    /** Cars are still arriving; a "nothing due" that flips to "2 overdue". */
    isLoading: boolean;
    /** The calendar year the spend figures cover. Injectable for tests. [D1] */
    year?: string;
}

type Tone = "ok" | "warning" | "danger";

/**
 * Home's status + spend card. [H6, R3, S2, D1, Home polish]
 *
 * Restructured into two zones separated by a hairline:
 *   Zone A — STATUS. A round tinted chip beside a headline sentence and a
 *            support line. "Nothing due / All cars are up to date" in the
 *            common case; a status-coloured chip + count + nearest-item
 *            hint when something wants attention.
 *   Zone B — SPEND. A single group renders as one right-aligned figure
 *            under "Spent this year"; multiple groups render per-group
 *            rows under the same label.
 *
 * ── Where the numbers come from ─────────────────────────────────────────────
 * Due counts are already tallied by `tallyByGroup` upstream. The
 * nearest-item hint is derived from the same `carsByGroup` map — no new
 * listener, no log-history read. Spend is `group.spendByYear[year]` off
 * the group document Home already listens to.
 *
 * Renders nothing until the counts are known, so the first paint never
 * claims "nothing due" and contradicts itself a moment later.
 */
const SummaryStrip = ({
    groups,
    byGroup,
    total,
    carsByGroup,
    isLoading,
    year = currentYear(),
}: SummaryStripProps) => {
    const { locale } = useLanguage();

    if (isLoading) return null;

    // No cars anywhere — a card about maintenance and running costs would be
    // explaining a feature rather than reporting a fact.
    if (Object.keys(byGroup).length === 0) return null;

    const totalDue = tallyTotal(total);
    const tone: Tone =
        total.overdue > 0 ? "danger" : total.dueSoon > 0 ? "warning" : "ok";

    // Zone A headline. Prefer the more urgent count if both exist —
    // "N overdue" beats "N due soon" for the top line; the support line
    // still names the specific item so a mixed state doesn't hide detail.
    const headline =
        totalDue === 0
            ? locale.due.stripNothing
            : total.overdue > 0
              ? locale.due.stripOverdue.replace(
                    "{count}",
                    String(total.overdue),
                )
              : locale.due.stripDueSoon.replace(
                    "{count}",
                    String(total.dueSoon),
                );

    // Zone A support line. Cheap derivation from cars we already hold; no
    // new query. Names the single nearest item, or falls back to a count
    // when many cars are affected.
    const supportLine = describeAttention(carsByGroup, totalDue, locale);

    // Zone B rows. Sorted most-actionable first: due > spend > name.
    const rows = groups
        .map((group) => ({
            group,
            due: tallyTotal(byGroup[group.id] ?? EMPTY_TALLY),
            spend: spendInYear(group, year),
        }))
        .sort(
            (a, b) =>
                b.due - a.due ||
                b.spend - a.spend ||
                a.group.name.localeCompare(b.group.name),
        );

    const singleGroup = rows.length === 1;

    return (
        <div className="summary-strip" aria-label={locale.due.stripAria}>
            {/* ── Zone A: status ─────────────────────────────────────────── */}
            <div className={`summary-status summary-tone-${tone}`}>
                <span
                    className={`summary-chip summary-chip-${tone}`}
                    aria-hidden="true"
                >
                    {tone === "ok" ? (
                        <Check size={20} strokeWidth={2.5} />
                    ) : (
                        <AlertTriangle size={20} strokeWidth={2.5} />
                    )}
                </span>
                <span className="summary-status-text">
                    <span className="summary-status-headline">
                        {headline}
                    </span>
                    {supportLine && (
                        <span className="summary-status-support">
                            {supportLine}
                        </span>
                    )}
                </span>
            </div>

            {/* ── Zone B: spend ──────────────────────────────────────────── */}
            <div className="summary-spend">
                {singleGroup ? (
                    // One group: one row. Group name is redundant when it's
                    // the only group anyway, and the row shrinks to label +
                    // figure — the whole card fits above the fold on 390px.
                    <div className="summary-spend-single">
                        <span className="summary-spend-label">
                            <Wallet
                                size={14}
                                strokeWidth={2.5}
                                aria-hidden="true"
                            />
                            <span>{locale.spend.stripYearShort}</span>
                        </span>
                        <span className="summary-spend-amount">
                            {formatRinggit(rows[0].spend)}
                        </span>
                    </div>
                ) : (
                    <>
                        <p className="summary-spend-caption">
                            <Wallet
                                size={14}
                                strokeWidth={2.5}
                                aria-hidden="true"
                            />
                            <span>{locale.spend.stripYearShort}</span>
                        </p>
                        <ul className="summary-rows">
                            {rows.map(({ group, due, spend }) => (
                                <li key={group.id}>
                                    <Link
                                        to={groupPath(group.id)}
                                        className="summary-row"
                                    >
                                        <span className="summary-row-name">
                                            {group.name}
                                        </span>
                                        {due > 0 && (
                                            <span className="summary-row-due">
                                                {due}
                                            </span>
                                        )}
                                        <span className="summary-row-spend">
                                            {formatRinggit(spend)}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
};

/**
 * Support-line copy for Zone A. Never a new subscription — walks the
 * already-loaded `carsByGroup` map and picks the single most urgent item
 * to name. Multiple attention cars collapse to a count so the line stays
 * one short sentence.
 */
const describeAttention = (
    carsByGroup: Record<string, Car[]> | undefined,
    totalDue: number,
    locale: ReturnType<typeof useLanguage>["locale"],
): string => {
    if (totalDue === 0) return locale.due.stripAllUpToDate;
    if (!carsByGroup) return "";

    // Find the single most urgent attention item across every car.
    // `dueForCar` already returns items worst-first per car; picking each
    // car's top and then ranking THOSE across cars gives us the winner in
    // one pass. Overdue beats due-soon; earlier date beats later.
    let winner: { car: Car; label: string; rank: number } | null = null;
    let affectedCars = 0;

    for (const cars of Object.values(carsByGroup)) {
        for (const car of cars) {
            const attention = needsAttention(dueForCar(car));
            if (attention.length === 0) continue;
            affectedCars += 1;

            const top = attention[0];
            const rank =
                (top.status === "OVERDUE" ? 0 : 1) * 1e15 +
                (top.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER);

            if (!winner || rank < winner.rank) {
                winner = { car, label: dueTypeLabel(top.type, car), rank };
            }
        }
    }

    if (affectedCars > 1) {
        return locale.due.stripAttentionCars.replace(
            "{count}",
            String(affectedCars),
        );
    }

    if (winner) {
        return `${winner.label}${locale.due.stripNearestSep}${carDisplayName(winner.car)}`;
    }

    return "";
};

export default SummaryStrip;
