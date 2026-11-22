import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import {
    Calendar,
    Check,
    ChevronDown,
    Gauge,
    NotebookPen,
    Wallet,
    Wrench,
} from "lucide-react";
import "./AddLog.css";

import AuthTextField from "../../components/login_register/AuthTextField";
import SelectField from "../../components/form/SelectField";
import IntervalEditor from "../../components/logs/IntervalEditor";
import LogFormShell from "../../components/logs/LogFormShell";
import { Button } from "../../components/ui";
import { useCar } from "../../controller/CarsController";
import { useGroup } from "../../controller/GroupsController";
import { useLogActions, useServiceLog, type LogDraft } from "../../controller/LogsController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { carDisplayName, hasCarEdit } from "../../model/Car";
import { CUSTOM_TYPE, findPreset, presetsByGroup } from "../../model/CarCatalogue";
import { todayInputValue, type Log } from "../../model/Log";
import { ROUTES, carPath } from "../../constants/routes";

/** A blank entry, dated today with the car's current reading prefilled. [L2] */
const emptyDraft = (odometer: number | undefined): LogDraft => ({
    type: "",
    customLabel: "",
    cost: "",
    date: todayInputValue(),
    odometer: odometer !== undefined ? String(odometer) : "",
    intervalKm: "",
    intervalMonths: "",
    notes: "",
    updateCarOdometer: true,
});

/** An existing entry, back in form shape. */
const draftFromLog = (log: Log): LogDraft => ({
    type: log.type,
    customLabel: log.customLabel ?? "",
    cost: String(log.cost),
    date: log.date ? todayInputValue(log.date.toDate()) : todayInputValue(),
    odometer: log.odometer !== undefined ? String(log.odometer) : "",
    intervalKm: log.intervalKm !== undefined ? String(log.intervalKm) : "",
    intervalMonths:
        log.intervalMonths !== undefined ? String(log.intervalMonths) : "",
    notes: log.notes ?? "",
    // Editing an old entry shouldn't quietly move the car's current reading.
    updateCarOdometer: false,
});

/**
 * Logging a service. [L1–L5]
 *
 * The same screen creates and edits — `:logId` decides which.
 *
 * Field order is the order the information exists in someone's head standing
 * in a workshop forecourt: what was done, what it cost, when, and only then
 * the optional detail. Type, cost and date are the only required fields, and
 * date is prefilled with today — so the fast path really is three taps and two
 * numbers.
 */
const AddLog = () => {
    const { groupId, carId, logId } = useParams<{
        groupId: string;
        carId: string;
        logId?: string;
    }>();
    const { locale } = useLanguage();
    const { user } = useUser();
    const navigate = useNavigate();

    const { group } = useGroup(groupId);
    const { car, isLoading: carLoading, notFound } = useCar(groupId, carId);
    const { log: editing, isLoading: logLoading } = useServiceLog(groupId, carId, logId);
    const { createLog, updateLog, isSaving, errors, clearError } = useLogActions(
        groupId,
        carId,
    );

    const isEditMode = Boolean(logId);

    const [draft, setDraft] = useState<LogDraft | null>(null);
    // More-options disclosure. Auto-opens in edit mode: if a user is editing
    // an existing entry they may want to see and adjust the interval or
    // notes too, and hiding those would need an extra tap to discover.
    const [showMore, setShowMore] = useState<boolean>(Boolean(logId));
    // Derived until the user types: the car (and the entry being edited) arrive
    // asynchronously, so a useState initialiser would capture blanks.
    const fields =
        draft ??
        (editing ? draftFromLog(editing) : emptyDraft(car?.odometer));

    const patch = (next: Partial<LogDraft>) => setDraft({ ...fields, ...next });

    const preset = findPreset(fields.type);
    const isCustom = fields.type === CUSTOM_TYPE;
    const canEdit =
        car !== null && hasCarEdit(car, user?.uid, group?.ownerId ?? "");

    /**
     * Choosing a type prefills its default interval. [L4]
     * Custom starts with none — there is no sensible default for "something
     * else", and a guessed one would be worse than a blank.
     */
    const handleType = (value: string) => {
        const chosen = findPreset(value);
        patch({
            type: value,
            intervalKm: chosen?.km ? String(chosen.km) : "",
            intervalMonths: chosen?.months ? String(chosen.months) : "",
        });
        clearError("type");
    };

    // Offered only when the entry's reading is genuinely ahead of the car's —
    // there is nothing to update otherwise.
    const servicedOdometer = Number(fields.odometer.trim().replace(/[\s,]/g, ""));
    const offersOdometerBump =
        !isEditMode &&
        Number.isFinite(servicedOdometer) &&
        fields.odometer.trim() !== "" &&
        (car?.odometer === undefined || servicedOdometer > car.odometer);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!car || !groupId || !carId || (isEditMode && !editing)) return;

        const saved = editing
            ? await updateLog(editing, fields)
            : await createLog(fields);

        if (saved) navigate(carPath(groupId, carId), { replace: true });
    };

    const backLink = groupId && carId ? carPath(groupId, carId) : ROUTES.home;
    const isLoading = carLoading || logLoading;

    // `draft` is `null` until the user touches any field — the initial
    // render sources from `emptyDraft(car?.odometer)` without setting state
    // (see the `fields` derivation above), so a non-null draft is exactly
    // "the user has typed something in this form". Good enough as the
    // dirty signal for the back-button confirm.
    const isDirty = draft !== null;

    return (
        <LogFormShell
            icon={Wrench}
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

                {/* The rules refuse this write anyway; saying so up front beats
                    a form that only fails on submit. [L1] */}
                {!isLoading && car && !canEdit && (
                    <div className="text-header">
                        <h1 className="title">{locale.logs.addTitle}</h1>
                        <p className="subtitle">{locale.cars.readOnlyNote}</p>
                    </div>
                )}

                {!isLoading && car && canEdit && isEditMode && !editing && (
                    <div className="text-header">
                        <h1 className="title">{locale.logs.editTitle}</h1>
                        <p className="subtitle" role="status">{locale.logs.entryUnavailable}</p>
                    </div>
                )}

                {!isLoading && car && canEdit && (!isEditMode || editing) && (
                    <>
                        <div className="text-header">
                            <h1 className="title">
                                {isEditMode
                                    ? locale.logs.editTitle
                                    : locale.logs.addTitle}
                            </h1>
                            {/* Form-purpose subtitle — distinguishes this
                                from the workshop-visit form at a glance.
                                Not rendered in edit mode: the header
                                already reads "Edit this entry" and there
                                is no sibling form to confuse it with. */}
                            {!isEditMode && (
                                <p className="log-form-purpose">
                                    {locale.logs.addSubtitle}
                                </p>
                            )}
                            <p className="subtitle">{carDisplayName(car)}</p>
                        </div>

                        {/*
                          * Field order per UX phase-2 (2c): the four things
                          * anyone standing in a workshop can answer without
                          * thinking — type, date, mileage, cost — and only
                          * those four visible by default. The rest sit
                          * behind "More options" with sensible presets
                          * carrying them, so Auntie's happy path is four
                          * taps and one submit. [UX 2c, R8]
                          */}
                        <form
                            onSubmit={handleSubmit}
                            className="animate-fade-in"
                            noValidate
                        >
                            <SelectField
                                label={locale.logs.typeLabel}
                                placeholder={locale.logs.typePlaceholder}
                                icon={Wrench}
                                value={fields.type}
                                onChange={(event) => handleType(event.target.value)}
                                groups={presetsByGroup().map((entry) => ({
                                    label: entry.group.label,
                                    options: entry.types.map((type) => ({
                                        value: type.id,
                                        label: type.label,
                                    })),
                                }))}
                                error={errors.type}
                                disabled={isSaving}
                            />

                            {isCustom && (
                                <AuthTextField
                                    label={locale.logs.customLabel}
                                    placeholder={locale.logs.customPlaceholder}
                                    type="text"
                                    icon={Wrench}
                                    value={fields.customLabel}
                                    onChange={(event) => {
                                        patch({ customLabel: event.target.value });
                                        clearError("customLabel");
                                    }}
                                    error={errors.customLabel}
                                    disabled={isSaving}
                                />
                            )}

                            <div className="add-log-date">
                                <label
                                    className="add-log-date-label"
                                    htmlFor="log-date"
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
                                        id="log-date"
                                        type="date"
                                        className="add-log-date-input"
                                        value={fields.date}
                                        // The native picker refuses the future
                                        // before the rules ever have to. [L2]
                                        max={todayInputValue()}
                                        onChange={(event) => {
                                            patch({ date: event.target.value });
                                            clearError("date");
                                        }}
                                        disabled={isSaving}
                                        aria-invalid={errors.date ? true : undefined}
                                    />
                                </div>
                                {errors.date && (
                                    <span className="add-log-error">{errors.date}</span>
                                )}
                            </div>

                            <AuthTextField
                                label={locale.logs.odometerLabel}
                                placeholder={locale.logs.odometerPlaceholder}
                                type="text"
                                inputMode="numeric"
                                icon={Gauge}
                                value={fields.odometer}
                                onChange={(event) => {
                                    patch({ odometer: event.target.value });
                                    clearError("odometer");
                                }}
                                error={errors.odometer}
                                disabled={isSaving}
                            />
                            <p className="add-log-hint">{locale.logs.odometerHint}</p>

                            {/* `decimal` rather than `numeric`: a cost has sen,
                                and a keypad with no decimal point is a trap. */}
                            <AuthTextField
                                label={locale.logs.costLabel}
                                placeholder={locale.logs.costPlaceholder}
                                type="text"
                                inputMode="decimal"
                                icon={Wallet}
                                value={fields.cost}
                                onChange={(event) => {
                                    patch({ cost: event.target.value });
                                    clearError("cost");
                                }}
                                error={errors.cost}
                                disabled={isSaving}
                            />

                            {/* Disclosure. The bump-current-reading checkbox,
                                the IntervalEditor and Notes all live behind
                                it. Presets from maintenance-types.json seed
                                the interval so the default is good enough
                                that Auntie never opens this. [UX 2c, R8] */}
                            <button
                                type="button"
                                className="add-log-more-toggle"
                                aria-expanded={showMore}
                                onClick={() => setShowMore((open) => !open)}
                            >
                                <span>
                                    {showMore
                                        ? locale.logs.moreOptionsHide
                                        : locale.logs.moreOptionsShow}
                                </span>
                                <ChevronDown
                                    size={16}
                                    strokeWidth={2.5}
                                    className={
                                        showMore ? "add-log-more-chevron-open" : ""
                                    }
                                    aria-hidden="true"
                                />
                            </button>

                            {showMore && (
                                <div className="add-log-more">
                                    {/* People log a service right after it
                                        happens, so the workshop's reading
                                        is usually the car's current one.
                                        Default on. */}
                                    {offersOdometerBump && (
                                        <label className="add-log-check">
                                            <input
                                                type="checkbox"
                                                checked={fields.updateCarOdometer}
                                                onChange={(event) =>
                                                    patch({
                                                        updateCarOdometer:
                                                            event.target.checked,
                                                    })
                                                }
                                                disabled={isSaving}
                                            />
                                            <span>
                                                {locale.logs.bumpOdometer.replace(
                                                    "{km}",
                                                    servicedOdometer.toLocaleString(),
                                                )}
                                            </span>
                                        </label>
                                    )}

                                    <IntervalEditor
                                        km={fields.intervalKm}
                                        months={fields.intervalMonths}
                                        onChange={(next) => {
                                            patch({
                                                ...(next.km !== undefined
                                                    ? { intervalKm: next.km }
                                                    : {}),
                                                ...(next.months !== undefined
                                                    ? { intervalMonths: next.months }
                                                    : {}),
                                            });
                                            clearError("intervalKm");
                                            clearError("intervalMonths");
                                        }}
                                        defaults={{
                                            km: preset?.km ? String(preset.km) : "",
                                            months: preset?.months
                                                ? String(preset.months)
                                                : "",
                                        }}
                                        kmError={errors.intervalKm}
                                        monthsError={errors.intervalMonths}
                                        disabled={isSaving}
                                    />

                                    <AuthTextField
                                        label={locale.logs.notesLabel}
                                        placeholder={locale.logs.notesPlaceholder}
                                        type="text"
                                        icon={NotebookPen}
                                        value={fields.notes}
                                        onChange={(event) =>
                                            patch({ notes: event.target.value })
                                        }
                                        disabled={isSaving}
                                    />
                                </div>
                            )}

                            <Button
                                type="submit"
                                variant="primary"
                                icon={isSaving ? undefined : Check}
                                iconTrailing
                                disabled={isSaving}
                                label={
                                    isSaving
                                        ? locale.common.processing
                                        : isEditMode
                                          ? locale.logs.saveEdit
                                          : locale.logs.save
                                }
                            />
                        </form>
                    </>
                )}
        </LogFormShell>
    );
};

export default AddLog;
