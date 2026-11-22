import { Link } from "react-router";
import { Wallet } from "lucide-react";
import "./Spend.css";

import { useLanguage } from "../../context/LanguageContext";
import { carDisplayName, type Car } from "../../model/Car";
import type { Group } from "../../model/Group";
import { byTotalDesc, sumMoney } from "../../lib/spend";
import { formatRinggit } from "../../utils/money";
import { carPath } from "../../constants/routes";
import { LazyMonthlyBar, LazyPerCarBar } from "./charts/LazyCharts";

interface GroupSpendProps {
    groupId: string;
    /** The group snapshot, for spendByMonth. Optional so a missing group
        doesn't blank the panel entirely — the per-car list still renders. */
    group?: Group;
    /** The group's cars, from the listener the page already holds. [S1] */
    cars: Car[];
}

/**
 * What this group has spent, all time. [S1]
 *
 * Every figure here is a sum of `car.totalSpend` over the cars the page is
 * ALREADY listening to — no log reads, no extra subscription, and it stays
 * live: logging a service on a phone moves this on the laptop.
 *
 * ── History ────────────────────────────────────────────────────────────────
 * The panel used to host the "Fix totals" repair (previously "Recalculate")
 * behind a menu here. In the UX phase-2 pass it moved to /manage — a rare
 * owner-only action doesn't belong in a display panel every visitor sees,
 * and putting it beside the totals it repairs invited "yes, fix them" as a
 * first reaction to a number someone didn't recognise. See the manage page
 * and the audit's CC3.
 */
const GroupSpend = ({ groupId, group, cars }: GroupSpendProps) => {
    const { locale } = useLanguage();

    // A group with no cars has nothing to total, and an empty spend panel on a
    // brand-new group is a section asking to be explained.
    if (cars.length === 0) return null;

    const rows = cars
        .map((car) => ({
            id: car.id,
            label: carDisplayName(car),
            total: car.totalSpend,
        }))
        .sort(byTotalDesc);

    const total = sumMoney(rows.map((row) => row.total));

    // State-dependent size [Group polish]: the RM 0 state is what every
    // brand-new group sits in, so it collapses to a single slim row.
    // Structured as separate spans (Spending · RM 0 — {empty}) so tests
    // asserting the individual literals ("RM 0" and the empty string)
    // still match the exact-text branches of getByText.
    if (total === 0) {
        return (
            <p className="spend-clear" role="status">
                <span className="spend-clear-label">
                    {locale.spend.groupTitle}
                </span>
                <span className="spend-clear-dot" aria-hidden="true">
                    ·
                </span>
                <span className="spend-clear-amount">
                    {formatRinggit(0, { noDecimals: true })}
                </span>
                <span className="spend-clear-dash" aria-hidden="true">
                    —
                </span>
                <span className="spend-clear-body">
                    {locale.spend.groupEmpty}
                </span>
            </p>
        );
    }

    return (
        <section className="spend-panel">
            <div className="spend-head">
                <Wallet size={16} strokeWidth={2.5} aria-hidden="true" />
                <h2 className="spend-title">{locale.spend.groupTitle}</h2>
            </div>

            {/* Headline is the answer to the question. Decimals off — the
                sen is noise at display size, and the per-car rows below
                still carry two-place amounts for column comparison. */}
            <p className="spend-total">
                {formatRinggit(total, { noDecimals: true })}
            </p>
            {/* "All time, across these cars" — the one caption. The old
                "Nothing has been logged" line moved to the slim RM 0
                branch above (it only ever applied there anyway). */}
            <p className="spend-total-label">{locale.spend.groupAllTime}</p>
            <p className="app-hint">{locale.spend.installedCostNote}</p>

            {/* Monthly bar chart (current year) from the group's own denorm.
                Lazy-loaded — recharts stays out of the main bundle. [SPD3,
                SPD5] */}
            <LazyMonthlyBar spendByMonth={group?.spendByMonth} />

            {/* Per-car horizontal bar — same data as the list below, but a
                visual shape that reads faster when there are 3+ cars. Only
                renders when there's more than one, matching the list rule. */}
            {cars.length > 1 && <LazyPerCarBar cars={cars} />}

            {/* A one-car group's per-car row would repeat the headline — the
                total IS that car's total. Suppress it; two-plus cars keep the
                list so the reader can see the split. */}
            {cars.length > 1 && (
                <ul className="spend-list">
                    {rows.map((row) => (
                        <li key={row.id} className="spend-row spend-row-linked">
                            <Link
                                to={carPath(groupId, row.id)}
                                className="spend-row-link"
                            >
                                <span className="spend-row-label">
                                    {row.label}
                                </span>
                                <span className="spend-row-amount">
                                    {formatRinggit(row.total)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default GroupSpend;
