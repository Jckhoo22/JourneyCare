import { lazy, Suspense } from "react";
import type { Car } from "../../../model/Car";

/**
 * Chart lazy-loading boundary. [T20, SPD5]
 *
 * Recharts is a ~150KB dependency. Lazy-importing it here means it does not
 * enter the main bundle at all — it lands as its own chunk on first render
 * of a spend chart. The car page and the group page each mount one of
 * these; the home strip stays chart-free (SPD6).
 *
 * A visible placeholder isn't shown — the fallback is null. Empty charts
 * are common (a car with no logs yet), so a loading spinner would flash on
 * mount and vanish, which is worse than nothing.
 */

const ByTypeDonutLazy = lazy(() => import("./ByTypeDonut"));
const MonthlyBarLazy = lazy(() => import("./MonthlyBar"));
const PerCarBarLazy = lazy(() => import("./PerCarBar"));

export const LazyByTypeDonut = (props: {
    spendByType: Record<string, number> | undefined;
}) => (
    <Suspense fallback={null}>
        <ByTypeDonutLazy {...props} />
    </Suspense>
);

export const LazyMonthlyBar = (props: {
    spendByMonth: Record<string, number> | undefined;
    year?: string;
}) => (
    <Suspense fallback={null}>
        <MonthlyBarLazy {...props} />
    </Suspense>
);

export const LazyPerCarBar = (props: { cars: Car[] }) => (
    <Suspense fallback={null}>
        <PerCarBarLazy {...props} />
    </Suspense>
);
