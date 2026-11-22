import { useState } from "react";
import { Link } from "react-router";
import { Car as CarIcon, ChevronRight } from "lucide-react";
import "./CarCard.css";

import { useLanguage } from "../../context/LanguageContext";
import { carPath } from "../../constants/routes";
import { dueForCar, dueTypeLabel, statusClass } from "../../model/Due";
import { needsAttention, type DueItem } from "../../lib/nextDue";
import { carDisplayName, type Car } from "../../model/Car";

interface CarCardProps {
    car: Car;
    groupId: string;
    groupName?: string;
}

/**
 * The row's thumbnail image, isolated so a `key={src}` above resets the
 * loaded flag every time the source changes — the parent doesn't need an
 * effect to keep the fade in sync with the photo.
 */
const CarCardImage = ({ src }: { src: string }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    return (
        <img
            className={`car-card-photo fade-in-on-load${
                isLoaded ? " is-loaded" : ""
            }`}
            src={src}
            alt=""
            aria-hidden="true"
            onLoad={() => setIsLoaded(true)}
        />
    );
};

/**
 * One car in the group's list. [C10, Group polish]
 *
 * ── Row grammar ──────────────────────────────────────────────────────────
 * A 96×64 thumbnail on the left, a two-line identity/status block in the
 * middle, and a chevron on the right — one 72px row. The thumbnail is the
 * biggest change from the previous shape (was 72×48): anything smaller than
 * ~90px wide turned a car photo into a blur, and a blur reads as broken.
 *
 * Line 1 is name + year inline ("Proton Saga · 2027"), truncated with an
 * ellipsis rather than wrapped so the status stays on line 2 no matter how
 * long the nickname is. Line 2 is a colored dot + one sentence about the
 * nearest attention item — the same status shape the home strip and the
 * badge use, so a card / a badge / a strip all read the same at a glance.
 *
 * Plate and odometer moved off the row in this pass: identity survives on
 * the car's own page (plate stays in the hero card, odometer in Stats),
 * and the group index answers a different question — "which of my cars
 * needs my attention next?". The status line IS that answer, and the meta
 * chips underneath were competing with it.
 *
 * The image slot is `photo ?? placeholder`, one rung shorter than
 * plan.md's precedence: there is no API-supplied image, because the
 * CarImages API is defunct and its successor is paid. See CONTEXT.md § the
 * CarImages gate.
 */
const CarCard = ({ car, groupId, groupName }: CarCardProps) => {
    const { locale } = useLanguage();
    // "Proton Saga · 2027" — year inline, quietly. Year alone if the make
    // is already the nickname (carSubtitle handles that de-dup case).
    const yearInline = car.year ? String(car.year) : "";
    // Nearest attention item wins the status line. `dueForCar` sorts by
    // urgency, so `needsAttention(...)[0]` IS the nearest thing to do —
    // no log reads, computed off `car.lastByType`. [R3]
    const attention = needsAttention(dueForCar(car));
    const nearest: DueItem | undefined = attention[0];
    const statusText = nearest
        ? (nearest.status === "OVERDUE"
              ? locale.cars.cardStatusOverdue
              : locale.cars.cardStatusDueSoon
          ).replace("{type}", dueTypeLabel(nearest.type, car))
        : locale.cars.cardStatusOk;
    const statusModifier = nearest ? statusClass(nearest.status) : "due-ok";

    return (
        <Link to={carPath(groupId, car.id)} className="car-card">
            <div className="car-card-image">
                {car.photo ? (
                    <CarCardImage key={car.photo} src={car.photo} />
                ) : (
                    <CarIcon
                        className="car-card-placeholder"
                        size={28}
                        strokeWidth={1.5}
                        aria-hidden="true"
                    />
                )}
            </div>

            <div className="car-card-body">
                {groupName && <span className="car-card-group">{groupName}</span>}
                <span className="car-card-line1">
                    <span className="car-card-name">
                        {carDisplayName(car)}
                    </span>
                    {yearInline && (
                        <>
                            <span
                                className="car-card-dot"
                                aria-hidden="true"
                            >
                                {"·"}
                            </span>
                            <span className="car-card-year">{yearInline}</span>
                        </>
                    )}
                </span>

                {/* Status line: a dot in the status colour, then one
                    sentence from already-loaded denormalised fields.
                    Reserved for the NEAREST item — a wall of overdue
                    items belongs on the car page, not the group index. */}
                <span className={`car-card-status ${statusModifier}`}>
                    <span
                        className="car-card-status-dot"
                        aria-hidden="true"
                    />
                    <span className="car-card-status-text">{statusText}</span>
                </span>
            </div>

            <ChevronRight
                size={18}
                strokeWidth={2.5}
                className="car-card-chevron"
            />
        </Link>
    );
};

export default CarCard;
