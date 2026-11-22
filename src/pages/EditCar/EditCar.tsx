import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Info } from "lucide-react";
import "../../styles/app-shell.css";
import "../AddCar/AddCar.css";

import TopBar from "../../components/app_shell/TopBar";
import BackLink from "../../components/BackLink";
import CarFields from "../../components/cars/CarFields";
import CarPhotoEditor from "../../components/cars/CarPhotoEditor";
import { Button } from "../../components/ui";
import {
    EMPTY_CAR_FIELDS,
    carToFields,
    resolvedBrand,
    resolvedModel,
} from "../../components/cars/carFieldsValue";
import { useAuthController } from "../../controller/AuthController";
import { useCar, useCarEditActions } from "../../controller/CarsController";
import { useGroup } from "../../controller/GroupsController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { carDisplayName, hasCarEdit } from "../../model/Car";
import { ROUTES, carPath, groupPath } from "../../constants/routes";

/**
 * Editing a car's identity. [C8]
 *
 * The same fields as Add, minus the odometer — that lives on the car page
 * behind the monotonic guard [C9], and a second way to set it would be a
 * second way to set it wrong.
 *
 * ── Shell ──────────────────────────────────────────────────────────────────
 * The shared page frame holds the navigation and a focused form column.
 * Photo sits above Details, with the
 * form's Save button OUTSIDE both cards (it commits the whole form, so
 * it belongs to neither). Photo save is a separate write path
 * (`savePhoto`) and stays independent of the details save; the split
 * only makes that independence visible.
 *
 * ── Dirty-state save ───────────────────────────────────────────────────────
 * Save is not rendered while `fields` matches the current car. A keystroke
 * reveals it; reverting the field hides it again. Same shape as Settings'
 * name field, for the same reason — a permanently-visible washed-teal button
 * trains the eye to ignore it. Photo saves are independent (`savePhoto` is
 * its own write path) and are not part of the details dirty check.
 *
 * ── Nickname self-heal ─────────────────────────────────────────────────────
 * The nickname is stored empty unless the user typed one — the display
 * fallback (`carDisplayName`) uses brand + model when it's absent. Older
 * cars in Firestore may carry a bogus `nickname: "Perodua Myvi"` from an
 * early build; on save, if the stored nickname is exactly "{brand} {model}"
 * and the user hasn't touched the field, this rewrites it as empty so the
 * document matches what the fallback would render anyway. `saveDetails`
 * already converts an empty string to a `deleteField()`, so no bulk
 * migration is needed and the rules (nickname optional, string ≤ 40 chars)
 * are unchanged.
 */
const EditCar = () => {
    const { groupId, carId } = useParams<{ groupId: string; carId: string }>();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { logout } = useAuthController();
    const navigate = useNavigate();

    const { group } = useGroup(groupId);
    const { car, isLoading, notFound } = useCar(groupId, carId);
    const { saveDetails, savePhoto, isSaving, errors, clearError } =
        useCarEditActions(groupId);

    /**
     * Derived until the user types, then theirs.
     *
     * The car arrives asynchronously, so the form can't be seeded in a
     * `useState` initialiser — and seeding it from an effect would be a
     * setState in an effect AND would overwrite what someone is halfway
     * through typing the moment another device touched the car. Falling back
     * to the live car until `draft` exists solves both. Same shape as the
     * username screen's prefill.
     */
    const [draft, setDraft] = useState<typeof EMPTY_CAR_FIELDS | null>(null);
    const seeded = car ? carToFields(car) : EMPTY_CAR_FIELDS;
    const fields = draft ?? seeded;

    const canEdit = car !== null && hasCarEdit(car, user?.uid, group?.ownerId ?? "");

    // A change ANYWHERE in the form reveals the Save. `seeded` is what the
    // car currently holds; if the two match, we have nothing to write.
    const isDirty =
        car !== null &&
        (fields.brand !== seeded.brand ||
            fields.brandOther !== seeded.brandOther ||
            fields.model !== seeded.model ||
            fields.modelOther !== seeded.modelOther ||
            fields.year !== seeded.year ||
            fields.nickname !== seeded.nickname ||
            fields.plate !== seeded.plate);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!car || !groupId || !carId || !isDirty) return;

        const brand = resolvedBrand(fields);
        const model = resolvedModel(fields);

        // Self-heal: an older stored nickname that just repeats the make and
        // model gets rewritten as empty when the user saves without touching
        // it. The display fallback returns the same string, so nothing about
        // what the family sees changes — the document just stops carrying the
        // stray. Only triggers on an exact match, and only when untouched.
        const untouchedNickname = fields.nickname === seeded.nickname;
        const nicknameIsMakeAndModel =
            (car.nickname ?? "").trim() === `${brand} ${model}`.trim() &&
            (car.nickname ?? "").trim().length > 0;
        const nicknameForWrite =
            untouchedNickname && nicknameIsMakeAndModel ? "" : fields.nickname;

        const saved = await saveDetails(car, {
            brand,
            model,
            year: Number(fields.year),
            nickname: nicknameForWrite,
            plate: fields.plate,
        });

        if (saved) navigate(carPath(groupId, carId), { replace: true });
    };

    const backLink =
        groupId && carId
            ? carPath(groupId, carId)
            : groupId
              ? groupPath(groupId)
              : ROUTES.home;

    return (
        <div className="app-page">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <main className="app-main">
                <TopBar onSignOut={logout} />
                <BackLink
                    to={backLink}
                    label={car ? carDisplayName(car) : null}
                />

                <div className="app-form-column">
                    {isLoading && (
                        <p className="app-hint">{locale.cars.loading}</p>
                    )}

                    {!isLoading && (notFound || !car) && (
                        <div className="app-empty">
                            <h1 className="app-empty-title">
                                {locale.groups.notFoundTitle}
                            </h1>
                            <p className="app-empty-body">
                                {locale.groups.notFoundBody}
                            </p>
                        </div>
                    )}

                    {/* The rules refuse this write anyway; saying so up front
                        beats a form that only fails on submit. [C6] */}
                    {!isLoading && car && !canEdit && (
                        <>
                            <h1 className="app-h1">{locale.cars.editTitle}</h1>
                            <p className="app-hint">
                                {locale.cars.readOnlyNote}
                            </p>
                        </>
                    )}

                    {!isLoading && car && canEdit && (
                        <>
                            <h1 className="app-h1">{locale.cars.editTitle}</h1>

                            {/* Photo section. Sits OUTSIDE the <form>
                                because `savePhoto` is its own write path
                                — a change here saves immediately,
                                independent of the dirty-state Save below.

                                No wrapping app-panel and no "Photo"
                                header: the image IS the section (the
                                CarPhotoEditor renders its own card-like
                                container, with actions living on the
                                image as overlay pills). See
                                CarPhotoEditor.tsx. */}
                            <CarPhotoEditor
                                car={car}
                                onSave={(dataUrl) => savePhoto(car, dataUrl)}
                                isSaving={isSaving}
                            />

                            {/* Details card + Save. The <form> wraps both so
                                the submit button (visually outside the
                                Details card) still triggers `handleSubmit`.
                                Save is dirty-state: absent when clean,
                                primary teal when dirty. Its presence IS the
                                "you have something to save" signal — no
                                checkmark in the idle label. */}
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
                                        onChange={setDraft}
                                        errors={errors}
                                        onClearError={clearError}
                                        disabled={isSaving}
                                    />
                                </section>

                                {isDirty && (
                                    <div className="car-form-save">
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            disabled={isSaving}
                                            label={
                                                isSaving
                                                    ? locale.common.processing
                                                    : locale.cars.editSave
                                            }
                                        />
                                    </div>
                                )}
                            </form>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
};

export default EditCar;
