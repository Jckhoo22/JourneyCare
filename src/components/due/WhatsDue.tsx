import { Link } from "react-router";
import { CalendarClock } from "lucide-react";
import "./WhatsDue.css";
import "./DueBadge.css";

import DueBadge from "./DueBadge";
import { useLanguage } from "../../context/LanguageContext";
import { dueForCar, dueTypeLabel, formatDue, statusClass } from "../../model/Due";
import { carDisplayName, type Car } from "../../model/Car";
import { needsAttention, sortByUrgency, type DueItem } from "../../lib/nextDue";
import { carPath } from "../../constants/routes";

interface WhatsDueProps {
    groupId: string;
    cars: Car[];
    now?: Date;
}

interface Row {
    car: Car;
    item: DueItem;
}

/**
 * What's due across a group's cars. [R3, Group polish]
 *
 * Only DUE_SOON and OVERDUE — a list that also enumerates everything fine is a
 * list nobody reads. Computed entirely from the `cars` listener the group page
 * already has: no log-history reads, no extra subscription.
 *
 * ── State-dependent size ─────────────────────────────────────────────────
 * When something is actually due, the section renders as a full card with
 * the section title and the list of items. When nothing is due — the state
 * the app spends most of its time in — the whole thing collapses to a
 * single slim status row (green dot + "All cars are up to date"). Chrome
 * scales with the amount there is to say.
 *
 * Renders nothing at all when there are no cars, so a brand-new group
 * isn't given an empty section to explain.
 */
const WhatsDue = ({ groupId, cars, now = new Date() }: WhatsDueProps) => {
    const { locale } = useLanguage();

    if (cars.length === 0) return null;

    const rows: Row[] = cars
        .flatMap((car) =>
            needsAttention(dueForCar(car, now)).map((item) => ({ car, item })),
        )
        .sort((a, b) => sortByUrgency(a.item, b.item));

    // All-clear: slim status line, not a card. `role="status"` marks it as
    // a live region equivalent to the previous panel-level heading, so a
    // reader that used to see a "What's due" heading here still gets the
    // section announced.
    if (rows.length === 0) {
        return (
            <p className="whatsdue-clear" role="status">
                <span className="whatsdue-clear-dot" aria-hidden="true" />
                <span>{locale.due.groupNothing}</span>
            </p>
        );
    }

    return (
        <section className="whatsdue">
            <div className="whatsdue-head">
                <CalendarClock size={16} strokeWidth={2.5} aria-hidden="true" />
                <h2 className="whatsdue-title">{locale.due.groupTitle}</h2>
            </div>

            <ul className="whatsdue-list">
                {rows.map(({ car, item }) => (
                    <li
                        key={`${car.id}:${item.type}`}
                        className={`whatsdue-item due-edge ${statusClass(item.status)}`}
                    >
                        <Link
                            to={carPath(groupId, car.id)}
                            className="whatsdue-link"
                        >
                            <span className="whatsdue-body">
                                <span className="whatsdue-what">
                                    {dueTypeLabel(item.type, car)}
                                </span>
                                <span className="whatsdue-car">
                                    {carDisplayName(car)}
                                </span>
                                <span className="whatsdue-when">
                                    {formatDue(item, locale)}
                                </span>
                            </span>
                            <DueBadge status={item.status} />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default WhatsDue;
