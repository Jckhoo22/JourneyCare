import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatRinggit } from "../../../utils/money";
import { currentYear, monthKeysOfYear } from "../../../lib/spend";

/**
 * Monthly spend bar chart, current year. [T20, SPD3]
 *
 * Reads from `group.spendByMonth` — a denormalised counter maintained by
 * every log batch (T17). Renders the twelve keys of the current year even
 * if some are absent; a month with no spending renders zero, not an omitted
 * bar.
 */

interface MonthlyBarProps {
    spendByMonth: Record<string, number> | undefined;
    year?: string;
}

const monthLabel = (key: string, locale = undefined as string | undefined): string => {
    const parts = key.split("-");
    if (parts.length < 2) return key;
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return date.toLocaleDateString(locale, { month: "short" });
};

const MonthlyBar = ({ spendByMonth, year = currentYear() }: MonthlyBarProps) => {
    const data = monthKeysOfYear(year).map((key) => ({
        key,
        label: monthLabel(key),
        value: spendByMonth?.[key] ?? 0,
    }));

    const total = data.reduce((sum, entry) => sum + entry.value, 0);

    // Empty year — everything is zero.
    if (total === 0) {
        return null;
    }

    return (
        <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
                <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid
                        stroke="var(--color-border)"
                        strokeDasharray="3 3"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="label"
                        tick={{
                            fill: "var(--color-text-subtle)",
                            fontSize: 12,
                        }}
                        axisLine={{ stroke: "var(--color-border)" }}
                        tickLine={false}
                    />
                    <YAxis
                        tickFormatter={(value: number) =>
                            value === 0 ? "" : formatRinggit(value, { noDecimals: true })
                        }
                        tick={{
                            fill: "var(--color-text-subtle)",
                            fontSize: 12,
                        }}
                        axisLine={{ stroke: "var(--color-border)" }}
                        tickLine={false}
                        width={70}
                    />
                    <Tooltip
                        formatter={(value) => [
                            formatRinggit(Number(value ?? 0)),
                            "",
                        ]}
                        labelFormatter={(label) => String(label ?? "")}
                        cursor={{ fill: "var(--color-primary-soft)" }}
                    />
                    <Bar
                        dataKey="value"
                        fill="var(--color-primary)"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default MonthlyBar;
