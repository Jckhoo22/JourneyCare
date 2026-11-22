import { useState } from "react";
import { Link } from "react-router";
import { Car as CarIcon, Pencil } from "lucide-react";
import "./CarPhotoPanel.css";

import { useLanguage } from "../../context/LanguageContext";
import { carDisplayName, carSubtitle, type Car } from "../../model/Car";

interface CarPhotoPanelProps {
    car: Car;
    /**
     * Href for the "Edit details" action in the hero card's footer.
     *
     * Absent when the viewer can't edit — the CarDetail page decides that,
     * and its "no edit href" state maps to "don't render the button" here.
     * This keeps the permissions call out of the presentation component and
     * leaves one place — `hasCarEdit` in `CarDetail.tsx` — where the answer
     * is made.
     */
    editHref?: string;
}

/**
 * The car photo itself, isolated so the `key={src}` above remounts it — and
 * resets `isLoaded` — every time the source changes. That's what makes each
 * new photo fade in over the frame instead of the previous one ghosting into
 * the next.
 */
const CarPhotoImage = ({ src, alt }: { src: string; alt: string }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    return (
        <img
            className={`car-hero-image fade-in-on-load${
                isLoaded ? " is-loaded" : ""
            }`}
            src={src}
            alt={alt}
            onLoad={() => setIsLoaded(true)}
        />
    );
};

/**
 * The car page's HERO CARD. [C5, Car polish, Hero redesign]
 *
 * ── What this component is now ────────────────────────────────────────────
 * A single card that merges what used to be the page's standalone header
 * with the framed photo underneath it. The image bleeds edge-to-edge with
 * only the top corners rounded; the footer row carries the car's identity
 * (nickname / make · model / year / plate) and the "Edit details" action
 * for viewers who can act on it. One card, one visual object.
 *
 * The old shape stacked a separate `<header>` above a `<CarPhotoPanel>`,
 * which cost vertical space above the fold and left the image floating —
 * attached to neither the title above nor the "What's next" card below.
 *
 * ── Frame proportions ────────────────────────────────────────────────────
 * 16:9. On a 390 px viewport the image is `390 × 9/16 ≈ 219 px`; the
 * footer row adds another ~64 px, so "What's next" still sits at or near
 * the fold on a phone.
 *
 * ── Fallback ─────────────────────────────────────────────────────────────
 * `photo ?? illustration`. `imageUrl` was deliberately dropped — the
 * CarImages API is gone and its successor is paid; see CONTEXT.md § the
 * CarImages gate. The illustration state renders the lucide car mark on
 * `--color-surface-muted` at ~60% container width so it reads as a
 * deliberate placeholder rather than a stretched graphic — same 16:9 box
 * as the photo state, no layout shift when a photo lands.
 *
 * ── Semantic wrapper ─────────────────────────────────────────────────────
 * The card renders as `<header>` because it IS the page's header — the
 * h1 (car name) lives inside it. Existing tests assert that the plate and
 * the Edit link sit inside a `<header>` element, which is what "identity,
 * not detail" means: the two things a family with two Myvis needs to see
 * before the picture makes sense.
 */
const CarPhotoPanel = ({ car, editHref }: CarPhotoPanelProps) => {
    const { locale } = useLanguage();
    const hasPhoto = Boolean(car.photo);
    const subtitle = carSubtitle(car);

    return (
        <header className="car-hero">
            <div
                className={`car-hero-media ${
                    hasPhoto ? "" : "car-hero-media-empty"
                }`}
            >
                {hasPhoto ? (
                    <CarPhotoImage
                        key={car.photo}
                        src={car.photo!}
                        alt={carDisplayName(car)}
                    />
                ) : (
                    <CarIcon
                        className="car-hero-illustration"
                        strokeWidth={1.25}
                        aria-hidden="true"
                    />
                )}
            </div>

            <div className="car-hero-foot">
                <div className="car-hero-identity">
                    <h1 className="car-hero-title">{carDisplayName(car)}</h1>
                    {subtitle && (
                        <p className="car-hero-subtitle">{subtitle}</p>
                    )}
                    {/* The one fact from the old details panel that
                        survived, because it's IDENTITY rather than
                        detail: a family with two Myvis needs to know
                        which one this page is about. */}
                    {car.plate && (
                        <p className="car-hero-plate">{car.plate}</p>
                    )}
                </div>

                {editHref && (
                    <Link to={editHref} className="car-hero-edit">
                        <Pencil size={16} strokeWidth={2.5} aria-hidden="true" />
                        <span>{locale.cars.editButton}</span>
                    </Link>
                )}
            </div>
        </header>
    );
};

export default CarPhotoPanel;
