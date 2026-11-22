import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
    Calendar,
    Camera,
    Check,
    ChevronDown,
    Gauge,
    NotebookPen,
    Plus,
    Receipt,
    Store,
    Trash2,
    Wallet,
    Wrench,
} from "lucide-react";
import "../AddLog/AddLog.css";
import "./AddVisit.css";

import AuthTextField from "../../components/login_register/AuthTextField";
import SelectField from "../../components/form/SelectField";
import LogFormShell from "../../components/logs/LogFormShell";
import { Button } from "../../components/ui";
import { useCar } from "../../controller/CarsController";
import { useGroup } from "../../controller/GroupsController";
import { useLogActions } from "../../controller/LogsController";
import { useParts } from "../../controller/PartsController";
import { useToast } from "../../context/Toast";
import { AI_CONFIG } from "../../app/config";
import { findPreset as findPresetById } from "../../model/CarCatalogue";
import { compressPhoto } from "../../utils/imageCompress";
import { formatRinggit } from "../../utils/money";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { carDisplayName, hasCarEdit } from "../../model/Car";
import { CUSTOM_TYPE, findPreset, presetsByGroup } from "../../model/CarCatalogue";
import { todayInputValue } from "../../model/Log";
import {
    emptyVisitItem,
    type VisitDraft,
    type VisitItemDraft,
} from "../../model/Visit";
import { ROUTES, carPath } from "../../constants/routes";

/**
 * A workshop visit — many items, ONE batched write. [T17, V1–V5]
 *
 * The single-entry AddLog stays as the "quick log" (V3 decision, kept). This
 * page owns the many-items shape: shared date, workshop, odometer at the top
 * and N line-item rows below. Save calls `createVisit`, which commits the
 * whole thing in one batch (see `LogsController.createVisit`).
 *
 * AI intake fills the same VisitDraft this form produces (V4), so extending
 * this screen with a "Scan receipt" button in T22 is a matter of setting the
 * draft state — no separate write path, no separate validator.
 */
const AddVisit = () => {
    const { groupId, carId } = useParams<{ groupId: string; carId: string }>();
    const [searchParams] = useSearchParams();
    const installingPartId = searchParams.get("installingPartId") ?? undefined;
    const { locale } = useLanguage();
    const { user } = useUser();
    const navigate = useNavigate();

    const { group } = useGroup(groupId);
    const { car, isLoading: carLoading, notFound } = useCar(groupId, carId);
    const { createVisit, isSaving, visitErrors, clearVisitError } =
        useLogActions(groupId, carId);
    // Only needed when installing a shelf part; otherwise the listener still
    // runs but its result is not used. Cost of one extra bounded listener is
    // acceptable; branching around it wouldn't help this page's read count.
    const { parts, isLoading: partsLoading } = useParts(groupId, carId);
    const partToInstall = installingPartId
        ? parts.find((entry) => entry.id === installingPartId && entry.status === "on_hand")
        : undefined;
    const partUnavailable = Boolean(installingPartId && !partsLoading && !partToInstall);

    const [draft, setDraft] = useState<VisitDraft>(() => ({
        date: todayInputValue(),
        odometer: "",
        workshop: "",
        updateCarOdometer: true,
        items: [emptyVisitItem()],
        ...(installingPartId ? { installingPartId } : {}),
    }));

    /**
     * Which item's full fields are open. `null` = all collapsed (rare;
     * happens only briefly after Add-another and while nothing has been
     * typed into the new one).
     *
     * Only ONE item is expanded at a time (spec item 5) — that keeps the
     * form to a single mental focus at a time, especially on a phone
     * where four collapsed rows fit above the fold. Tapping a collapsed
     * row's header expands it, collapsing whoever was open.
     */
    const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

    // Receipt scan [T22, AI1-AI5]. All state and handlers live here so the
    // AI Logic module can be lazy-imported only on first tap. The button is
    // gated on AI_CONFIG.scanEnabled — with the flag off it never renders,
    // no SDK loads, no App Check token is minted.
    const { addToast } = useToast();
    const [isScanning, setIsScanning] = useState(false);
    const [scanReview, setScanReview] = useState<{
        lowConfidence: number;
        other: number;
    } | null>(null);

    const handleScanReceipt = async (file: File) => {
        if (!AI_CONFIG.scanEnabled || isScanning || isSaving) return;

        setIsScanning(true);
        try {
            // Reuse the Phase 2 photo pipeline: EXIF, HEIC, resize, JPEG
            // compression. The model gets the same-shape bytes any camera
            // upload elsewhere in the app produces. [AI1]
            const compressed = await compressPhoto(file);

            // Dynamic import — recharts-style lazy boundary. [AI2, SPD5-analog]
            const { scanReceipt } = await import("../../lib/aiClient");
            const response = await scanReceipt(compressed.dataUrl);

            if (!response.ok) {
                // All three fallbacks materialise as normal UX. The user
                // ends up on the manual form no matter which branch fired.
                switch (response.failure.kind) {
                    case "quota":
                        addToast(locale.logs.scanQuotaExhausted, "error");
                        break;
                    case "unreadable":
                        addToast(locale.logs.scanUnreadable, "error");
                        break;
                    case "malformed":
                    case "network":
                        // Malformed and network errors log to console only —
                        // the user doesn't need "your model returned bad JSON",
                        // they need the manual form. [AI4 fallback matrix]
                        addToast(locale.logs.scanUnreadable, "error");
                        break;
                }
                return;
            }

            // Pre-fill the draft. The installing-part path takes precedence:
            // if this AddVisit came from ?installingPartId=, we preserve that
            // linkage in the merged draft.
            setDraft((current) => ({
                ...response.result.draft,
                ...(current.installingPartId
                    ? { installingPartId: current.installingPartId }
                    : {}),
            }));
            setScanReview({
                lowConfidence: response.result.lowConfidenceCount,
                other: response.result.otherCount,
            });
            addToast(locale.logs.scanReady, "success");
        } catch (error) {
            console.error("Scan receipt error:", error);
            addToast(locale.logs.scanUnreadable, "error");
        } finally {
            setIsScanning(false);
        }
    };

    // Pre-fill the first item from the shelf part once it's loaded. The part
    // arrives asynchronously through the useParts listener, so this is a
    // synchronising effect between external state (Firestore) and the local
    // editable draft — the pattern the react-hooks/set-state-in-effect rule
    // explicitly allows.
    const [hasPrefilledPart, setHasPrefilledPart] = useState(false);
    useEffect(() => {
        if (!partToInstall || hasPrefilledPart) return;

        const preset = findPresetById(partToInstall.typeId);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDraft((current) => ({
            ...current,
            items: [
                {
                    ...current.items[0],
                    type: partToInstall.typeId,
                    customLabel: partToInstall.customName ?? "",
                    cost: String(partToInstall.cost),
                    intervalKm: preset?.km ? String(preset.km) : "",
                    intervalMonths: preset?.months ? String(preset.months) : "",
                    notes: partToInstall.notes ?? "",
                    partsShelf: false, // installing, not re-shelving
                },
                ...current.items.slice(1),
            ],
        }));
        setHasPrefilledPart(true);
    }, [partToInstall, hasPrefilledPart]);

    const [initialMileage, setInitialMileage] = useState<string>();
    if (car && initialMileage === undefined) {
        const reading = car.odometer === undefined ? "" : String(car.odometer);
        setInitialMileage(reading);
        setDraft({ ...draft, odometer: reading });
    }

    const patch = (next: Partial<VisitDraft>) => setDraft({ ...draft, ...next });
    const patchItem = (index: number, next: Partial<VisitItemDraft>) => {
        setDraft({
            ...draft,
            items: draft.items.map((item, i) =>
                i === index ? { ...item, ...next } : item,
            ),
        });
    };

    /**
     * Add a fresh row and open it. Per spec: collapse the current one on
     * the way (the "only one open" invariant is what makes the list read
     * as a stack of receipts rather than a stack of forms).
     *
     * The Add button is DISABLED when the currently-open row has no type
     * yet — an untyped row can't render as a collapsed summary, so
     * adding a second expanded row would break the invariant. The
     * `canAddAnother` check below decides that; here we only run when
     * the guard has already passed.
     */
    const addItem = () => {
        const next = [...draft.items, emptyVisitItem()];
        setDraft({ ...draft, items: next });
        setExpandedIndex(next.length - 1);
    };

    /**
     * The Add-another guard. Also used to hide the running total row's
     * "N items" from counting a row nobody has typed anything into.
     */
    const activeItem =
        expandedIndex !== null ? draft.items[expandedIndex] : null;
    const canAddAnother = activeItem === null || activeItem.type !== "";

    const removeItem = (index: number) => {
        const next =
            draft.items.length === 1
                ? [emptyVisitItem()]
                : draft.items.filter((_, i) => i !== index);
        setDraft({ ...draft, items: next });
        // If the removed row was the open one, open the previous — never
        // land the user on a wall of collapsed rows with nothing focused.
        if (expandedIndex === null) return;
        if (expandedIndex === index) {
            setExpandedIndex(Math.max(0, index - 1));
        } else if (expandedIndex > index) {
            setExpandedIndex(expandedIndex - 1);
        }
    };

    /**
     * Tap a collapsed row's header → open it, closing whoever was open.
     *
     * Edge case guarded here: the currently-expanded row may be a blank
     * row the user added and then walked away from (no type = no summary
     * to collapse to). If we just moved `expandedIndex`, both rows would
     * render expanded and the "only one open" invariant would break.
     * When the current row is entirely untouched, we drop it silently
     * on the way — cheaper than leaving a stranded row and cleaner than
     * a modal "your item is empty" nag.
     */
    const openItem = (index: number) => {
        if (expandedIndex === null || expandedIndex === index) {
            setExpandedIndex(index);
            return;
        }
        const current = draft.items[expandedIndex];
        const isCurrentUntouched =
            current &&
            current.type === "" &&
            current.customLabel === "" &&
            current.cost === "" &&
            current.notes === "" &&
            !current.partsShelf;

        if (isCurrentUntouched && draft.items.length > 1) {
            const remaining = draft.items.filter(
                (_, i) => i !== expandedIndex,
            );
            const adjusted = index > expandedIndex ? index - 1 : index;
            setDraft({ ...draft, items: remaining });
            setExpandedIndex(adjusted);
            return;
        }

        setExpandedIndex(index);
    };

    const canEdit =
        car !== null && hasCarEdit(car, user?.uid, group?.ownerId ?? "");
    const dateError = visitErrors.find((row) => row?.date)?.date;
    const mileageError = visitErrors.find((row) => row?.odometer)?.odometer;

    const handleTypeChange = (index: number, value: string) => {
        const chosen = findPreset(value);
        patchItem(index, {
            type: value,
            intervalKm: chosen?.km ? String(chosen.km) : "",
            intervalMonths: chosen?.months ? String(chosen.months) : "",
        });
        clearVisitError(index, "type");
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!car || !groupId || !carId || (installingPartId && !partToInstall)) return;

        const saved = await createVisit(draft);
        if (saved) navigate(carPath(groupId, carId), { replace: true });
    };

    /**
     * Running-total math. [Spec item 7]
     *
     * We count rows whose type has been picked — that's what makes a row
     * "an item" the user can see themselves paying for. Shelf-toggled
     * (buy-for-later) rows are EXCLUDED from the money total to match how
     * `resolveVisit` treats them: `partsToShelve` items don't sum into
     * `totalCost` in `createVisit`, they land on the shelf and their cost
     * enters the denorm only at install (decision #25).
     *
     * They ARE counted in the "N items" ticker on the left, because from
     * the user's point of view they still committed to buying it today.
     * The right side reports what will actually be logged as spend today.
     */
    const countedItems = draft.items.filter((item) => item.type !== "");
    const totalToday = draft.items
        .filter((item) => item.type !== "" && !item.partsShelf)
        .reduce((sum, item) => {
            const parsed = Number(
                item.cost.trim().replace(/[\s,]/g, ""),
            );
            return Number.isFinite(parsed) && parsed > 0 ? sum + parsed : sum;
        }, 0);

    const backLink = groupId && carId ? carPath(groupId, carId) : ROUTES.home;
    const isLoading = carLoading;

    // Dirty when the user has actually put content into the form. Date and
    // odometer are excluded — date defaults to today and odometer is
    // prefilled from the car, so neither is a user-typed value at rest.
    // We DO count a second item row: adding one requires an explicit tap.
    const isDirty =
        draft.workshop.trim() !== "" ||
        draft.date !== todayInputValue() ||
        draft.odometer !== (initialMileage ?? "") ||
        draft.items.length > 1 ||
        draft.items.some(
            (item) =>
                item.type !== "" ||
                item.cost.trim() !== "" ||
                item.customLabel.trim() !== "" ||
                item.notes.trim() !== "" ||
                item.partsShelf,
        );

    return (
        <LogFormShell
            icon={Receipt}
            backTo={backLink}
            backLabel={car ? carDisplayName(car) : null}
            isDirty={isDirty}
        >
                {isLoading && <p className="add-log-hint">{locale.logs.loading}</p>}

                {!isLoading && (notFound || !car) && (
                    <div className="text-header">
                        <h1 className="title">{locale.groups.notFoundTitle}</h1>
                        <p className="subtitle">{locale.groups.notFoundBody}</p>
                    </div>
                )}

                {!isLoading && car && !canEdit && (
                    <div className="text-header">
                        <h1 className="title">{locale.logs.visitAddTitle}</h1>
                        <p className="subtitle">{locale.cars.readOnlyNote}</p>
                    </div>
                )}

                {!isLoading && car && canEdit && (
                    <>
                        <div className="text-header">
                            <h1 className="title">
                                {locale.logs.visitAddTitle}
                            </h1>
                            <p className="log-form-purpose">
                                {locale.logs.visitAddSubtitle}
                            </p>
                            <p className="subtitle">{carDisplayName(car)}</p>
                        </div>

                        {/* Scan receipt entry point [T22, AI1, AI2].
                            Rendered only when AI_CONFIG.scanEnabled is true —
                            with the flag off, the whole feature is invisible
                            and the module never loads (see aiClient.ts's
                            dynamic import). */}
                        {AI_CONFIG.scanEnabled && (
                            <div className="visit-scan-block">
                                <label
                                    className="visit-scan-button"
                                    aria-label={locale.logs.scanReceipt}
                                >
                                    <Camera size={18} strokeWidth={2} />
                                    <span>
                                        {isScanning
                                            ? locale.logs.scanProcessing
                                            : locale.logs.scanReceipt}
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        disabled={isScanning || isSaving}
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            if (file) void handleScanReceipt(file);
                                            event.target.value = "";
                                        }}
                                        style={{ display: "none" }}
                                    />
                                </label>
                                <p className="add-log-hint">
                                    {locale.logs.scanReceiptHint}
                                </p>
                                {scanReview && scanReview.lowConfidence > 0 && (
                                    <p className="visit-scan-warn">
                                        {locale.logs.scanReviewLowConfidence.replace(
                                            "{count}",
                                            String(scanReview.lowConfidence),
                                        )}
                                    </p>
                                )}
                                {scanReview && scanReview.other > 0 && (
                                    <p className="visit-scan-warn">
                                        {locale.logs.scanReviewCustom.replace(
                                            "{count}",
                                            String(scanReview.other),
                                        )}
                                    </p>
                                )}
                            </div>
                        )}

                        <form
                            onSubmit={handleSubmit}
                            className="animate-fade-in"
                            noValidate
                        >
                            {partUnavailable && (
                                <p className="app-error" role="alert">{locale.logs.visitShelfItemUnavailable}</p>
                            )}
                            <div className="add-log-date">
                                <label
                                    className="add-log-date-label"
                                    htmlFor="visit-date"
                                >
                                    {locale.logs.dateLabel}
                                </label>
                                <div className="add-log-date-wrap">
                                    <Calendar
                                        size={18}
                                        strokeWidth={1.5}
                                        className="add-log-date-icon"
                                        aria-hidden="true"
                                    />
                                    <input
                                        id="visit-date"
                                        type="date"
                                        className="add-log-date-input"
                                        value={draft.date}
                                        max={todayInputValue()}
                                        onChange={(event) => {
                                            patch({ date: event.target.value });
                                            visitErrors.forEach((_, index) => clearVisitError(index, "date"));
                                        }}
                                        disabled={isSaving}
                                        aria-invalid={dateError ? true : undefined}
                                        aria-describedby={dateError ? "visit-date-error" : undefined}
                                    />
                                </div>
                                {dateError && <p id="visit-date-error" className="add-log-error">{dateError}</p>}
                            </div>

                            <AuthTextField
                                label={locale.logs.visitWorkshopLabel}
                                placeholder={locale.logs.visitWorkshopPlaceholder}
                                type="text"
                                icon={Store}
                                value={draft.workshop}
                                onChange={(event) =>
                                    patch({ workshop: event.target.value })
                                }
                                disabled={isSaving}
                            />

                            <AuthTextField
                                label={locale.logs.odometerLabel}
                                placeholder={locale.logs.odometerPlaceholder}
                                type="text"
                                inputMode="numeric"
                                icon={Gauge}
                                value={draft.odometer}
                                onChange={(event) => {
                                    patch({ odometer: event.target.value });
                                    visitErrors.forEach((_, index) => clearVisitError(index, "odometer"));
                                }}
                                error={mileageError}
                                disabled={isSaving}
                            />
                            <p className="add-log-hint">
                                {locale.logs.odometerHint}
                            </p>

                            <div className="visit-item-list">
                                {draft.items.map((item, index) => {
                                    const preset = findPreset(item.type);
                                    const isCustom = item.type === CUSTOM_TYPE;
                                    const isShelfInstall = Boolean(installingPartId && index === 0);
                                    const rowErr = visitErrors[index];
                                    const isExpanded = expandedIndex === index ||
                                        Boolean(rowErr?.type || rowErr?.customLabel || rowErr?.cost);
                                    // A row without a type has nothing to
                                    // show as a summary — force it open so
                                    // the user always has SOMETHING to fill.
                                    const canCollapse = item.type !== "";

                                    // ── Collapsed summary row ─────────────
                                    if (!isExpanded && canCollapse) {
                                        const typeName = isCustom
                                            ? item.customLabel ||
                                              locale.logs.customLabel
                                            : preset?.label ?? item.type;
                                        const notesSnippet =
                                            item.notes.trim() ||
                                            (item.partsShelf
                                                ? locale.logs.visitToShelf
                                                : locale.logs.visitItemNoNotes);
                                        const costForRow = Number(
                                            item.cost
                                                .trim()
                                                .replace(/[\s,]/g, ""),
                                        );
                                        return (
                                            <button
                                                key={index}
                                                type="button"
                                                className="visit-item-summary"
                                                onClick={() => openItem(index)}
                                                aria-expanded={false}
                                                aria-label={locale.logs.visitItemHeading.replace(
                                                    "{index}",
                                                    String(index + 1),
                                                )}
                                            >
                                                <Check
                                                    size={16}
                                                    strokeWidth={2.5}
                                                    className="visit-item-summary-check"
                                                    aria-hidden="true"
                                                />
                                                <span className="visit-item-summary-body">
                                                    <span className="visit-item-summary-type">
                                                        {typeName}
                                                    </span>
                                                    <span className="visit-item-summary-notes">
                                                        {notesSnippet}
                                                    </span>
                                                </span>
                                                <span className="visit-item-summary-cost">
                                                    {Number.isFinite(costForRow) &&
                                                    costForRow > 0
                                                        ? formatRinggit(
                                                              costForRow,
                                                          )
                                                        : ""}
                                                </span>
                                                <ChevronDown
                                                    size={16}
                                                    strokeWidth={2.25}
                                                    className="visit-item-summary-chevron"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        );
                                    }

                                    // ── Expanded item ────────────────────
                                    return (
                                        <div
                                            key={index}
                                            className="visit-item"
                                        >
                                            <div className="visit-item-header">
                                                <span className="visit-item-title">
                                                    {locale.logs.visitItemHeading.replace(
                                                        "{index}",
                                                        String(index + 1),
                                                    )}
                                                </span>
                                                {isShelfInstall ? (
                                                    <span className="visit-shelf-badge">
                                                        {locale.parts.onHandBadge}
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="visit-item-remove"
                                                        onClick={() => removeItem(index)}
                                                        disabled={isSaving}
                                                        aria-label={locale.logs.visitRemoveItem}
                                                    >
                                                        <Trash2 size={16} strokeWidth={1.75} />
                                                    </button>
                                                )}
                                            </div>

                                            <SelectField
                                                label={locale.logs.typeLabel}
                                                placeholder={
                                                    locale.logs.typePlaceholder
                                                }
                                                icon={Wrench}
                                                value={item.type}
                                                onChange={(event) =>
                                                    handleTypeChange(
                                                        index,
                                                        event.target.value,
                                                    )
                                                }
                                                groups={presetsByGroup().map(
                                                    (entry) => ({
                                                        label: entry.group.label,
                                                        options: entry.types.map(
                                                            (type) => ({
                                                                value: type.id,
                                                                label: type.label,
                                                            }),
                                                        ),
                                                    }),
                                                )}
                                                error={rowErr?.type}
                                                disabled={isSaving || isShelfInstall}
                                            />

                                            {isCustom && (
                                                <AuthTextField
                                                    label={locale.logs.customLabel}
                                                    placeholder={
                                                        locale.logs.customPlaceholder
                                                    }
                                                    type="text"
                                                    icon={Wrench}
                                                    value={item.customLabel}
                                                    onChange={(event) => {
                                                        patchItem(index, {
                                                            customLabel:
                                                                event.target.value,
                                                        });
                                                        clearVisitError(
                                                            index,
                                                            "customLabel",
                                                        );
                                                    }}
                                                    error={rowErr?.customLabel}
                                                    disabled={isSaving || isShelfInstall}
                                                />
                                            )}

                                            {/* Cost + Notes side-by-side on
                                                wide screens, stacked on
                                                phones (see AddVisit.css
                                                .visit-item-two-col). */}
                                            <div className="visit-item-two-col">
                                                <AuthTextField
                                                    label={locale.logs.costLabel}
                                                    placeholder={
                                                        locale.logs.costPlaceholder
                                                    }
                                                    type="text"
                                                    inputMode="decimal"
                                                    icon={Wallet}
                                                    value={item.cost}
                                                    onChange={(event) => {
                                                        patchItem(index, {
                                                            cost: event.target
                                                                .value,
                                                        });
                                                        clearVisitError(
                                                            index,
                                                            "cost",
                                                        );
                                                    }}
                                                    error={rowErr?.cost}
                                                    disabled={isSaving || isShelfInstall}
                                                />

                                                <AuthTextField
                                                    label={
                                                        locale.logs.visitItemNotesLabel
                                                    }
                                                    placeholder={
                                                        locale.logs.visitItemNotesPlaceholder
                                                    }
                                                    type="text"
                                                    icon={NotebookPen}
                                                    value={item.notes}
                                                    onChange={(event) =>
                                                        patchItem(index, {
                                                            notes: event.target
                                                                .value,
                                                        })
                                                    }
                                                    disabled={isSaving}
                                                />
                                            </div>

                                            {/* PRT5 — plain checkbox row.
                                                No tinted background (that
                                                read as an alert). Hint text
                                                appears only when checked so
                                                the resting form doesn't
                                                explain something the user
                                                hasn't opted into yet. */}
                                            {!isShelfInstall && <label className="visit-shelf-plain">
                                                <input
                                                    type="checkbox"
                                                    checked={item.partsShelf}
                                                    onChange={(event) =>
                                                        patchItem(index, {
                                                            partsShelf:
                                                                event.target.checked,
                                                        })
                                                    }
                                                    disabled={isSaving}
                                                />
                                                <span className="visit-shelf-plain-label">
                                                    {locale.logs.visitToShelf}
                                                </span>
                                            </label>}
                                            {item.partsShelf && (
                                                <p className="visit-shelf-plain-hint">
                                                    {locale.logs.visitToShelfHint}
                                                </p>
                                            )}

                                            {preset && !isCustom && (
                                                <p className="add-log-hint">
                                                    {preset.km
                                                        ? locale.logs.intervalSummaryOne
                                                        : locale.logs.intervalSummaryNone}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                className="visit-add-item"
                                onClick={addItem}
                                disabled={isSaving || !canAddAnother}
                            >
                                <Plus size={16} strokeWidth={2.5} />
                                <span>{locale.logs.visitAddItem}</span>
                            </button>

                            {/* Running total row. [Spec 7] Left counts every
                                row that has a type; right sums the money
                                only for rows that will be LOGGED today —
                                shelf items are excluded exactly the way
                                `resolveVisit` excludes them from the batch's
                                totalCost. This is a live preview of the
                                spend the visit will produce, so keeping it
                                in step with the model is the whole point. */}
                            {countedItems.length > 0 && (
                                <div className="visit-total-row">
                                    <span className="visit-total-count">
                                        {countedItems.length === 1
                                            ? locale.logs.visitTotalItemsOne
                                            : locale.logs.visitTotalItemsMany.replace(
                                                  "{count}",
                                                  String(countedItems.length),
                                              )}
                                    </span>
                                    <span className="visit-total-amount">
                                        {locale.logs.visitTotalAmount.replace(
                                            "{amount}",
                                            formatRinggit(totalToday),
                                        )}
                                    </span>
                                </div>
                            )}

                            <Button
                                type="submit"
                                variant="primary"
                                icon={isSaving ? undefined : Check}
                                iconTrailing
                                disabled={isSaving || Boolean(installingPartId && !partToInstall)}
                                label={
                                    isSaving
                                        ? locale.common.processing
                                        : locale.logs.visitSaveButton
                                }
                            />
                        </form>
                    </>
                )}
        </LogFormShell>
    );
};

export default AddVisit;
