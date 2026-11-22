import { useMemo } from "react";
import {
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
} from "recharts";
import { findPreset } from "../../../model/CarCatalogue";
import { useLanguage } from "../../../context/LanguageContext";
import { formatRinggit } from "../../../utils/money";

/**
 * Donut of spend by service type. [T20, SPD2]
 *
 * Reads from `car.spendByType` — a denormalised counter maintained by every
 * log batch (T17). ZERO log-history reads: the whole chart cost is the same
 * one document the car page already listens to.
 *
 * Palette comes from `tokens.css` custom properties so a theme swap (teal
 * default, ?theme=mono override) reaches every slice without a touch here.
 * The status colours are deliberately NOT in the palette — a slice must
 * never read as "overdue" (see CONTEXT.md § Status colour is never the
 * accent).
 *
 * Empty state: no bar chart at all, just a friendly line above ("No
 * spending recorded yet"). An empty axis is worse than no axis.
 */

interface Slice {
    key: string;
    label: string;
    value: number;
}

interface ByTypeDonutProps {
    spendByType: Record<string, number> | undefined;
}

/**
 * The palette. Six neutral shades derived from the accent so a slice never
 * competes with a status colour or with the accent's own hover treatment.
 * Read directly from CSS custom properties at render — that keeps the theme
 * swap working (the property values differ between themes, the slice count
 * doesn't).
 */
const PALETTE_TOKENS = [
    "--color-primary",
    "--color-primary-hover",
    "--color-text",
    "--color-text-body",
    "--color-text-subtle",
    "--color-text-faint",
];

const resolvePaletteColor = (index: number): string => {
    const token = PALETTE_TOKENS[index % PALETTE_TOKENS.length];
    if (typeof window === "undefined") return "#0F766E"; // SSR fallback
    return (
        window
            .getComputedStyle(document.documentElement)
            .getPropertyValue(token)
            .trim() || "#0F766E"
    );
};

const ByTypeDonut = ({ spendByType }: ByTypeDonutProps) => {
    const { locale } = useLanguage();
    const customLabel = locale.spend.customBucket;
    const slices: Slice[] = useMemo(() => {
        if (!spendByType) return [];
        return Object.entries(spendByType)
            .filter(([, amount]) => amount > 0)
            .map(([key, value]) => ({
                key,
                label:
                    key === "custom"
                        ? customLabel
                        : findPreset(key)?.label ?? key,
                value,
            }))
            .sort((a, b) => b.value - a.value);
    }, [spendByType, customLabel]);

    const total = slices.reduce((sum, slice) => sum + slice.value, 0);

    if (slices.length === 0) {
        return null;
    }

    return (
        <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={slices}
                        dataKey="value"
                        nameKey="label"
                        innerRadius="55%"
                        outerRadius="85%"
                        strokeWidth={2}
                        stroke="var(--color-page)"
                        isAnimationActive={false}
                    >
                        {slices.map((_, index) => (
                            <Cell
                                key={`s-${index}`}
                                fill={resolvePaletteColor(index)}
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={(value, name) => [
                            formatRinggit(Number(value ?? 0)),
                            String(name ?? ""),
                        ]}
                        cursor={false}
                    />
                </PieChart>
            </ResponsiveContainer>
            <p
                aria-hidden="true"
                style={{
                    marginTop: "-140px",
                    textAlign: "center",
                    color: "var(--color-text)",
                    fontWeight: "var(--weight-semibold)",
                    fontSize: "var(--text-lg)",
                    pointerEvents: "none",
                }}
            >
                {formatRinggit(total, { noDecimals: true })}
            </p>
        </div>
    );
};

export default ByTypeDonut;
