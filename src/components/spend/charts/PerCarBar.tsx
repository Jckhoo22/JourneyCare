import {
    Bar,
    BarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatRinggit } from "../../../utils/money";
import { carDisplayName, type Car } from "../../../model/Car";

/**
 * Horizontal bar chart of all-time spend per car. [T20, SPD3]
 *
 * Reads only `car.totalSpend` (a denorm maintained by every log batch). No
 * history reads. Layout: vertical bars are hard to read at 390px when the
 * car names differ in length, so this uses horizontal bars — car name on Y,
 * spend on X.
 */

interface PerCarBarProps {
    cars: Car[];
}

const PerCarBar = ({ cars }: PerCarBarProps) => {
    const data = cars
        .map((car) => ({
            key: car.id,
            label: carDisplayName(car),
            value: car.totalSpend ?? 0,
        }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value);

    if (data.length === 0) return null;

    // Height scales with the number of cars — 36px per row, min 100.
    const height = Math.max(100, data.length * 44);

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                    <XAxis
                        type="number"
                        tickFormatter={(value: number) =>
                            value === 0 ? "" : formatRinggit(value, { noDecimals: true })
                        }
                        tick={{ fill: "var(--color-text-subtle)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        dataKey="label"
                        type="category"
                        tick={{ fill: "var(--color-text-body)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={110}
                    />
                    <Tooltip
                        formatter={(value) => [
                            formatRinggit(Number(value ?? 0)),
                            "",
                        ]}
                        cursor={{ fill: "var(--color-primary-soft)" }}
                    />
                    <Bar
                        dataKey="value"
                        fill="var(--color-primary)"
                        radius={[0, 4, 4, 0]}
                        isAnimationActive={false}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default PerCarBar;
