import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Info } from "lucide-react";
import "../../styles/app-shell.css";
import "./AddCar.css";

import TopBar from "../../components/app_shell/TopBar";
import BackLink from "../../components/BackLink";
import CarFields from "../../components/cars/CarFields";
import { Button } from "../../components/ui";
import {
    EMPTY_CAR_FIELDS,
    resolvedBrand,
    resolvedModel,
} from "../../components/cars/carFieldsValue";
import { useAuthController } from "../../controller/AuthController";
import { useCarActions } from "../../controller/CarsController";
import { useGroup } from "../../controller/GroupsController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { canAddCars } from "../../model/Group";
import { ROUTES, groupPath, carPath } from "../../constants/routes";

/**
 * Add a car to a group. [C1, C2, C3]
 *
 * Brand → model → year from the bundled list, with a free-text escape at
 * "Other" so a curated list never becomes a wall. Everything below the year is
 * optional — the barrier to getting a car into the app should be as low as it
 * can be, and a nickname or an odometer reading can arrive later.
 *
 * ── Shell ──────────────────────────────────────────────────────────────────
 * Standard in-app shell (TopBar + BackLink + narrow form column), matching
 * Settings and Add log. NOT the auth-shell card — this is signed-in in-app
 * work, not an authentication step.
 *
 * ── Save behaviour ─────────────────────────────────────────────────────────
 * Save is always visible on Add — there is no clean state on a create form,
 * so the Settings dirty-state pattern wouldn't have anything to hide. Instead
 * the button is DISABLED until brand, model and year are set, with a one-line
 * reason beside it so a disabled button never reads as a dead-end.
 */
const AddCar = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { logout } = useAuthController();
    const navigate = useNavigate();

    const { group, isLoading, notFound } = useGroup(groupId);
    const { createCar, isSaving, errors, clearError } = useCarActions(groupId);

    const [fields, setFields] = useState(EMPTY_CAR_FIELDS);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!groupId) return;

        const carId = await createCar({
            brand: resolvedBrand(fields),
            model: resolvedModel(fields),
            year: Number(fields.year),
            nickname: fields.nickname,
            plate: fields.plate,
            odometer: fields.odometer,
        });

        // Land on the new car's own page. `replace: true` keeps the back stack
        // pointing at the group listing rather than the create form.
        if (carId) navigate(carPath(groupId, carId), { replace: true });
    };

    const backLink = groupId ? groupPath(groupId) : ROUTES.home;
    const mayAdd = group !== null && canAddCars(group, user?.uid);

    // Save is always rendered; it's disabled until the three required
    // pickers have been answered. Same required-set the controller validates,
    // so the button and the write agree about "ready".
    const requiredReady =
        Boolean(resolvedBrand(fields).trim()) &&
        Boolean(resolvedModel(fields).trim()) &&
        Boolean(fields.year);

    return (
        <div className="app-page">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <main className="app-main">
                <TopBar onSignOut={logout} />
                <BackLink to={backLink} label={group?.name} />

                <div className="app-form-column">
                    {isLoading && (
                        <p className="app-hint">{locale.groups.loading}</p>
                    )}

                    {!isLoading && (notFound || !group) && (
                        <div className="app-empty">
                            <h1 className="app-empty-title">
                                {locale.groups.notFoundTitle}
                            </h1>
                            <p className="app-empty-body">
                                {locale.groups.notFoundBody}
                            </p>
                        </div>
                    )}

                    {/* A member without car-adding rights. The rules would refuse
                        the write anyway; saying so up front beats a form that
                        only fails on submit. [C1] */}
                    {!isLoading && group && !mayAdd && (
                        <div className="app-empty">
                            <h1 className="app-empty-title">
                                {locale.cars.cannotAddTitle}
                            </h1>
                            <p className="app-empty-body">
                                {locale.cars.cannotAddBody}
                            </p>
                        </div>
                    )}

                    {!isLoading && group && mayAdd && (
                        <>
                            <h1 className="app-h1">{locale.cars.addTitle}</h1>
                            <p className="app-hint">{locale.cars.addSubtitle}</p>

                            {/* Details card + Save. AddCar has no Photo
                                card — a photo goes on after the car
                                exists, on the Edit screen — but the split
                                still applies so Save sits OUTSIDE the
                                card (it commits the whole form, so it
                                belongs to neither the card nor the
                                fields). Same shape as EditCar. */}
                            <form
                                onSubmit={handleSubmit}
                                className="animate-fade-in car-form"
                                noValidate
                            >
                                <section className="app-panel">
                                    <div className="car-form-section-head">
                                        <Info
                                            size={16}
                                            strokeWidth={2.5}
                                            aria-hidden="true"
                                        />
                                        <h2 className="car-form-section-title">
                                            {locale.cars.detailsTitle}
                                        </h2>
                                    </div>
                                    <CarFields
                                        value={fields}
                                        onChange={setFields}
                                        errors={errors}
                                        onClearError={clearError}
                                        disabled={isSaving}
                                        showOdometer
                                    />
                                </section>

                                <div className="car-form-save">
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        disabled={isSaving || !requiredReady}
                                        label={
                                            isSaving
                                                ? locale.common.processing
                                                : locale.cars.saveButton
                                        }
                                    />
                                    {/* Reason surfaces only while the button
                                        is disabled for the "not ready" case —
                                        a save-in-flight disable is a separate
                                        state and its own label carries the
                                        meaning. */}
                                    {!requiredReady && !isSaving && (
                                        <p className="car-form-hint">
                                            {locale.cars.addDisabledHint}
                                        </p>
                                    )}
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AddCar;
