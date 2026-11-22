import { useEffect, useState } from "react";
import { ChevronDown, ListFilter } from "lucide-react";
import "./DueList.css";

import { useLanguage } from "../../context/LanguageContext";
import type { Locale } from "../../locale/English";
import type { Car } from "../../model/Car";
import { carLastServices, dueTypeLabel, formatDue, statusClass } from "../../model/Due";
import { dueCountdown, nextDueForCar, type DueItem, type LastService } from "../../lib/nextDue";

const formatRemaining = (value: number | undefined, left: string, overdue: string) =>
    value === undefined
        ? null
        : (value < 0 ? overdue : left).replace("{count}", Math.abs(value).toLocaleString());

interface ServiceRowProps {
    item: DueItem;
    last: LastService;
    odometer: number | undefined;
    now: Date;
    locale: Locale;
    name: string;
}

const ServiceRow = ({ item, last, odometer, now, locale, name }: ServiceRowProps) => {
    const labels = locale.due;
    const { days, km, progress } = dueCountdown(item, last, odometer, now);
    const countdown = [
        formatRemaining(km, labels.kmLeft, labels.kmOver),
        formatRemaining(days, labels.daysLeft, labels.daysOver),
    ].filter(Boolean).join(" · ");
    const lastDate = last.date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
    const lastService = last.odometer === undefined
        ? labels.lastServiceDate.replace("{date}", lastDate)
        : labels.lastServiceWithKm.replace("{date}", lastDate)
            .replace("{km}", last.odometer.toLocaleString());

    return (
        <li>
            <details className="timeline-row">
                <summary className="timeline-row-trigger">
                    <span className="timeline-service">{name}</span>
                    <span className="timeline-countdown">{countdown || labels.mileageNeeded}</span>
                    <ChevronDown className="timeline-chevron" size={16} aria-hidden="true" />
                    {countdown && (
                        <progress className="due-progress" max={100} value={progress} aria-hidden="true" />
                    )}
                    <span className="timeline-target">{formatDue(item, locale)}</span>
                </summary>
                <div className="timeline-details">
                    <p>{lastService}</p>
                    {item.kmStatusUnknown && <p>{labels.updateOdometer}</p>}
                </div>
            </details>
        </li>
    );
};

const DueList = ({ car }: { car: Car }) => {
    const { locale } = useLanguage();
    const labels = locale.due;
    const [now, setNow] = useState(() => new Date());
    const [filter, setFilter] = useState("ALL");

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const services = carLastServices(car);
    const items = nextDueForCar(services, car.odometer, now);
    const groups = [
        {
            key: "OVERDUE",
            label: labels.overdue,
            className: statusClass("OVERDUE"),
            items: items.filter((item) => item.status === "OVERDUE"),
        },
        {
            key: "DUE_SOON",
            label: labels.dueSoon,
            className: statusClass("DUE_SOON"),
            items: items.filter((item) => item.status === "DUE_SOON"),
        },
        {
            key: "OK",
            label: labels.onTrack,
            className: statusClass("OK"),
            items: items.filter((item) => item.status === "OK" && (item.dueDate || !item.kmStatusUnknown)),
        },
        {
            key: "UNKNOWN",
            label: labels.mileageNeeded,
            className: "",
            items: items.filter((item) => item.kmStatusUnknown && !item.dueDate),
        },
    ];

    if (items.length === 0) {
        return <p className="app-panel timeline-empty">{labels.noneTracked}</p>;
    }

    const filters = [
        { key: "ALL", label: labels.filterAll, className: "", items },
        ...groups.filter((group) => group.key !== "UNKNOWN" || group.items.length > 0 || filter === group.key),
    ];
    const visibleGroups = groups.filter(
        (group) => group.items.length > 0 && (filter === "ALL" || filter === group.key),
    );

    return (
        <div className="timeline-checklist">
            <div className="timeline-filter" role="group" aria-label={labels.filterStatus}>
                <ListFilter className="timeline-filter-icon" size={18} aria-hidden="true" />
                {filters.map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        className={`timeline-filter-button ${option.className}`}
                        aria-pressed={filter === option.key}
                        onClick={() => setFilter(option.key)}
                    >
                        {option.label}
                        <span className="timeline-filter-count">{option.items.length}</span>
                    </button>
                ))}
            </div>
            {visibleGroups.length === 0 && (
                <p className="app-panel timeline-empty" role="status">{labels.filterEmpty}</p>
            )}
            {visibleGroups.map((group) => (
                <section key={group.key} className={`timeline-group ${group.className}`}>
                    <h2 className="timeline-group-title">{group.label}</h2>
                    <ul className="timeline-rows">
                        {group.items.map((item) => (
                            <ServiceRow
                                key={item.type}
                                item={item}
                                last={services[item.type]}
                                odometer={car.odometer}
                                now={now}
                                locale={locale}
                                name={dueTypeLabel(item.type, car)}
                            />
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
};

export default DueList;
