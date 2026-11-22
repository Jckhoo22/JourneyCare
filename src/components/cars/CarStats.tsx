import { useState, type FormEvent } from "react";
import { Camera, Gauge, Wallet } from "lucide-react";
import "./CarStats.css";

import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/Toast";
import { AI_CONFIG } from "../../app/config";
import { Button } from "../ui";
import { formatOdometer, lastMatchingOdometerService, type Car } from "../../model/Car";
import { formatRinggit } from "../../utils/money";
import { compressPhoto } from "../../utils/imageCompress";
import type { OdometerOutcome } from "../../controller/CarsController";

interface CarStatsProps {
    car: Car;
    canEdit: boolean;
    onSaveOdometer: (
        raw: string,
        options?: { confirmCorrection?: boolean },
    ) => Promise<OdometerOutcome>;
    isSaving: boolean;
    error: string;
    onClearError: () => void;
    mileageOnly?: boolean;
}

/** "12 Mar 2026" */
const formatDate = (value: Car["odometerCorrectedAt"] | undefined): string =>
    value
        ? value.toDate().toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
          })
        : "";

/**
 * The car's two numbers, side by side. [C9, S1]
 *
 * This replaces `OdometerPanel`, which gave the odometer a panel, a heading and
 * a display-size reading of its own — the visual weight of a headline. It was
 * the second thing on the page, above the history.
 *
 * That was the wrong emphasis. People open a car to see WHAT WAS DONE to it;
 * the mileage is a supporting fact, and one they mostly consult while entering
 * something else. So both numbers are now small stats of equal weight, sitting
 * below the history rather than above it.
 *
 * What did NOT get demoted is the odometer's correction guard. An odometer
 * doesn't run backwards, so a lower reading is either a typo or a correction,
 * and this still asks which before writing — the rules refuse an unstamped
 * decrease regardless, and this is what turns that refusal into a question the
 * user can answer. Shrinking a control's presentation must not quietly shrink
 * what it protects.
 */
const CarStats = ({
    car,
    canEdit,
    onSaveOdometer,
    isSaving,
    error,
    onClearError,
    mileageOnly = false,
}: CarStatsProps) => {
    const { locale } = useLanguage();
    const { addToast } = useToast();

    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [pendingCorrection, setPendingCorrection] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);

    /**
     * Odometer snap. [T23, ODO1-ODO4]
     *
     * Behind the same AI_CONFIG.scanEnabled flag as the receipt scan. The
     * result pre-fills the edit input so the existing C9 confirm-lower-value
     * flow handles the ODO4 lower-than-current case — no separate confirm
     * screen, no monotonic override.
     */
    const handleScanOdometer = async (file: File) => {
        if (!AI_CONFIG.scanEnabled || isScanning || isSaving) return;

        setIsScanning(true);
        try {
            const compressed = await compressPhoto(file);
            const { scanOdometer } = await import("../../lib/aiClient");
            const response = await scanOdometer(compressed.dataUrl);

            if (!response.ok) {
                switch (response.failure.kind) {
                    case "quota":
                        addToast(locale.cars.scanOdometerQuota, "error");
                        break;
                    default:
                        addToast(locale.cars.scanOdometerUnreadable, "error");
                }
                return;
            }

            const { odometer: read, confidence } = response.result;

            // ODO4: the prompt's "couldn't read it" signal (odometer = 0)
            // OR low confidence OR a value LOWER than the current reading
            // all route to the same "retake or type" state. The monotonic
            // override is NEVER surfaced by the scan path.
            const currentOdo = car.odometer ?? 0;
            const isMisread =
                read === 0 ||
                confidence === "low" ||
                (car.odometer !== undefined && read < currentOdo);

            if (isMisread) {
                addToast(locale.cars.scanOdometerRetake, "error");
                setIsEditing(true);
                setDraft("");
                return;
            }

            // Good read. Land the user on the edit input pre-filled — they
            // still confirm before writing. Draft-then-confirm (decision #21).
            setIsEditing(true);
            setDraft(String(read));
            addToast(locale.cars.scanOdometerRead, "success");
        } catch (error) {
            console.error("Scan odometer error:", error);
            addToast(locale.cars.scanOdometerUnreadable, "error");
        } finally {
            setIsScanning(false);
        }
    };

    const close = () => {
        onClearError();
        setPendingCorrection(null);
        setIsEditing(false);
    };

    const submit = async (options?: { confirmCorrection?: boolean }) => {
        const outcome = await onSaveOdometer(draft, options);

        if (outcome === "needs-confirmation") {
            setPendingCorrection(draft);
            return;
        }
        if (outcome === "saved" || outcome === "unchanged") close();
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await submit();
    };

    const reading = formatOdometer(car.odometer);
    const correctedOn = formatDate(car.odometerCorrectedAt);
    const matchedOn = mileageOnly ? formatDate(lastMatchingOdometerService(car)) : "";
    const recordedOn = mileageOnly ? formatDate(car.odometerRecordedAt) : "";

    return (
        <section className="car-stats">
            <div className={mileageOnly ? "car-stats-grid car-stats-grid-single" : "car-stats-grid"}>
                <div className="car-stat">
                    <span className="car-stat-label">
                        <Gauge size={14} strokeWidth={2.5} aria-hidden="true" />
                        <span>{locale.cars.odometerTitle}</span>
                    </span>
                    <span className="car-stat-value">
                        {reading || locale.cars.odometerNone}
                    </span>
                    {mileageOnly && reading && (
                        <span className="car-stat-note">
                            {recordedOn
                                ? locale.due.mileageRecordedOn.replace("{date}", recordedOn)
                                : matchedOn
                                  ? locale.due.mileageLastMatched.replace("{date}", matchedOn)
                                  : locale.due.mileageDateUnknown}
                        </span>
                    )}
                    {correctedOn && (
                        <span className="car-stat-note">
                            {locale.cars.odometerCorrectedOn.replace(
                                "{date}",
                                correctedOn,
                            )}
                        </span>
                    )}
                    {canEdit && !isEditing && (
                        <div className="car-stat-actions">
                            <button
                                type="button"
                                className="car-stat-action"
                                onClick={() => {
                                    setDraft(
                                        car.odometer !== undefined
                                            ? String(car.odometer)
                                            : "",
                                    );
                                    setIsEditing(true);
                                }}
                            >
                                {locale.cars.odometerUpdate}
                            </button>
                            {!mileageOnly && AI_CONFIG.scanEnabled && (
                                <label
                                    className="car-stat-action car-stat-scan"
                                    aria-label={locale.cars.scanOdometer}
                                >
                                    <Camera
                                        size={14}
                                        strokeWidth={2}
                                        aria-hidden="true"
                                    />
                                    <span>
                                        {isScanning
                                            ? locale.cars.scanOdometerProcessing
                                            : locale.cars.scanOdometer}
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        disabled={isScanning || isSaving}
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            if (file)
                                                void handleScanOdometer(file);
                                            event.target.value = "";
                                        }}
                                        style={{ display: "none" }}
                                    />
                                </label>
                            )}
                        </div>
                    )}
                </div>

                {/* The car's lifetime counter, not a sum of the loaded page —
                    so this figure is complete however much history is on
                    screen. The by-type split below is the partial one. [S1]

                    `noDecimals: true` — same treatment the Group and Home
                    pages already give their headline totals. Per-entry
                    rows below keep two places since RM 11.00 is real
                    precision. [Car polish] */}
                {!mileageOnly && <div className="car-stat">
                    <span className="car-stat-label">
                        <Wallet size={14} strokeWidth={2.5} aria-hidden="true" />
                        <span>{locale.spend.carTitle}</span>
                    </span>
                    <span className="car-stat-value">
                        {formatRinggit(car.totalSpend, { noDecimals: true })}
                    </span>
                    <span className="car-stat-note">{locale.spend.allTime}</span>
                </div>}
            </div>

            {isEditing && (
                <form className="car-stats-form" onSubmit={handleSubmit} noValidate>
                    <label className="car-stats-label" htmlFor="odometer-input">
                        {locale.cars.odometerLabel}
                    </label>
                    <input
                        id="odometer-input"
                        className="car-stats-input"
                        inputMode="numeric"
                        autoFocus
                        value={draft}
                        onChange={(event) => {
                            setDraft(event.target.value);
                            // A new value invalidates a confirmation that was
                            // asked about the previous one.
                            setPendingCorrection(null);
                            onClearError();
                        }}
                        placeholder={locale.cars.odometerPlaceholder}
                        disabled={isSaving}
                        aria-invalid={error ? true : undefined}
                    />
                    {error && <span className="car-stats-error">{error}</span>}

                    {/* The guard. [C9] */}
                    {pendingCorrection !== null && (
                        <div className="car-stats-confirm" role="alert">
                            <p className="car-stats-confirm-title">
                                {locale.cars.odometerLowerTitle}
                            </p>
                            <p className="car-stats-confirm-body">
                                {locale.cars.odometerLowerBody
                                    .replace("{current}", reading)
                                    .replace(
                                        "{next}",
                                        formatOdometer(Number(pendingCorrection)),
                                    )}
                            </p>
                        </div>
                    )}

                    <div className="car-stats-actions">
                        {pendingCorrection === null ? (
                            <Button
                                type="submit"
                                variant="primary"
                                inline
                                disabled={isSaving}
                                label={
                                    isSaving
                                        ? locale.common.processing
                                        : locale.cars.odometerSave
                                }
                            />
                        ) : (
                            <Button
                                variant="danger-solid"
                                inline
                                onClick={() =>
                                    submit({ confirmCorrection: true })
                                }
                                disabled={isSaving}
                                label={
                                    isSaving
                                        ? locale.common.processing
                                        : locale.cars.odometerLowerConfirm
                                }
                            />
                        )}

                        <Button
                            variant="text"
                            onClick={close}
                            disabled={isSaving}
                            label={locale.cars.odometerCancel}
                        />
                    </div>
                </form>
            )}
        </section>
    );
};

export default CarStats;
