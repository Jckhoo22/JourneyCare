import { Wallet } from "lucide-react";
import "./Spend.css";

import { useLanguage } from "../../context/LanguageContext";
import type { Log } from "../../model/Log";
import { findPreset } from "../../model/CarCatalogue";
import type { Car } from "../../model/Car";
import { formatRinggit } from "../../utils/money";
import { LazyByTypeDonut } from "./charts/LazyCharts";

interface CarSpendProps {
    car: Car;
    /** The history the page has already loaded — no reads of its own. [S1] */
    logs: Log[];
    /** More entries sit behind the current page, so the breakdown is partial. */
    hasMore: boolean;
    isLoading: boolean;
}

/**
 * What this car has cost. [S1]
 *
 * The by-type split, and only that. The lifetime TOTAL moved out to the stat
 * row in `CarStats` when the car page was restructured — it is a headline fact
 * about the car, not a heading for this list, and printing it in both places
 * would invite the reader to check one against the other.
 *
 * The two still have different provenance, which is the thing to keep hold of:
 *
 *   the TOTAL       is `car.totalSpend` — the counter every log write
 *                   maintains, so it covers the car's whole life however long
 *                   that is and costs nothing to read;
 *   the BREAKDOWN   is summed from the log history LogHistory has already
 *                   loaded, because a per-type split can't come from a single
 *                   number and re-reading the history to build one would
 *                   double this page's reads for a detail.
 *
 * So this list can legitimately account for less than the stat above it, and
 * when it does the panel says so rather than letting the reader assume the
 * columns should add up. Loading more history fills it in.
 *
 * A list, not a chart. At family scale there are a handful of service types and
 * the question is "what did the tyres cost" — which a number answers and a
 * donut makes you hover for.
 */
const CarSpend = ({ car, logs, isLoading }: CarSpendProps) => {
    const { locale } = useLanguage();

    // Nothing spent and nothing logged is a car nobody has touched yet: a panel
    // reading RM 0.00 would be explaining a feature rather than reporting.
    if (isLoading || (logs.length === 0 && car.totalSpend === 0)) return null;

    // T20's honesty fix (SPD2): the by-type split is now read from the
    // DENORMALISED counter maintained by every log batch, not summed from
    // whichever page of history the LogHistory panel happens to have loaded.
    // The old "partial breakdown" caveat is gone with it — the numbers now
    // agree with the total by construction, and Recalculate is the repair
    // if they ever don't. [SPD1, SPD2, SPD4]
    const spendByType = car.spendByType ?? {};
    const lines = Object.entries(spendByType)
        .filter(([, amount]) => amount > 0)
        .map(([key, amount]) => ({
            key,
            label:
                key === "custom"
                    ? locale.spend.customBucket
                    : findPreset(key)?.label ?? key,
            total: amount,
        }))
        .sort((a, b) => b.total - a.total);

    return (
        <section className="spend-panel">
            <div className="spend-head">
                <Wallet size={16} strokeWidth={2.5} aria-hidden="true" />
                <h2 className="spend-title">{locale.spend.breakdownTitle}</h2>
            </div>
            <p className="app-hint">{locale.spend.installedCostNote}</p>

            {/* Donut: same data as the list, lazy-loaded so recharts stays
                out of the main bundle. Renders nothing when the map is empty
                — see ByTypeDonut. [SPD5] */}
            <LazyByTypeDonut spendByType={spendByType} />

            {lines.length > 0 && (
                <ul className="spend-list spend-list-top">
                    {lines.map((line) => (
                        <li key={line.key} className="spend-row">
                            <span className="spend-row-main">
                                <span className="spend-row-label">
                                    {line.label}
                                </span>
                            </span>
                            <span className="spend-row-amount">
                                {formatRinggit(line.total)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default CarSpend;
