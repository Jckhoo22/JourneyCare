import "./CarFields.css";

import AuthTextField from "../login_register/AuthTextField";
import ComboField from "../form/ComboField";
import SelectField from "../form/SelectField";
import { useLanguage } from "../../context/LanguageContext";
import type { CarFieldErrors } from "../../controller/CarsController";
import {
    brandNames,
    findModel,
    isOtherBrand,
    modelsForBrand,
    openYearRange,
    yearsForModel,
} from "../../model/CarCatalogue";
import type { CarFieldsValue } from "./carFieldsValue";

/**
 * The car form's fields, shared by Add and Edit. [C2, C3, C8]
 *
 * Extracted rather than duplicated: the brand → model → year cascade has real
 * rules in it (choosing a brand invalidates the model, choosing a model
 * invalidates the year, "Other" swaps two pickers for two text fields), and two
 * copies of that would drift the first time one screen changed.
 *
 * ── Chrome ────────────────────────────────────────────────────────────────
 * Rendered without leading icons on any of the fields. The car-form scope in
 * CarFields.css also flips the shared `.input-label` from all-caps to the
 * settings-style sentence-case label — the icon + caps eyebrow was the auth
 * screens' voice, not this in-app form's. Matches the Settings precedent.
 */

const asOptions = (values: string[]) =>
    values.map((entry) => ({ value: entry, label: entry }));

interface CarFieldsProps {
    value: CarFieldsValue;
    onChange: (next: CarFieldsValue) => void;
    errors: CarFieldErrors;
    onClearError: (field: keyof CarFieldErrors) => void;
    disabled?: boolean;
    /** The odometer belongs to the car page once a car exists. [C9] */
    showOdometer?: boolean;
}

const CarFields = ({
    value,
    onChange,
    errors,
    onClearError,
    disabled = false,
    showOdometer = false,
}: CarFieldsProps) => {
    const { locale } = useLanguage();
    const freeText = isOtherBrand(value.brand);

    const patch = (next: Partial<CarFieldsValue>) =>
        onChange({ ...value, ...next });

    // Changing a step invalidates the ones below it — a Myvi with a BMW badge
    // is not a state this form should be able to reach.
    const handleBrand = (next: string) => {
        patch({ brand: next, model: "", year: "" });
        onClearError("brand");
    };

    const handleModel = (next: string) => {
        patch({ model: next, year: "" });
        onClearError("model");
    };

    const years = freeText
        ? openYearRange()
        : yearsForModel(findModel(value.brand, value.model));

    return (
        <div className="car-fields">
            {/* Brand and Model are type-to-search comboboxes (ComboField):
                the catalogue is long enough (40+ brands, and some brands
                have 20+ models) that scrolling the OS picker to reach one
                is slower than typing "per". Year stays a native select —
                it's a short numeric list where a picker beats a filter. */}
            <ComboField
                label={locale.cars.brandLabel}
                placeholder={locale.cars.brandPlaceholder}
                value={value.brand}
                onChange={handleBrand}
                options={asOptions(brandNames())}
                error={errors.brand}
                disabled={disabled}
            />

            {freeText ? (
                <>
                    <AuthTextField
                        label={locale.cars.brandOtherLabel}
                        placeholder={locale.cars.brandOtherPlaceholder}
                        type="text"
                        value={value.brandOther}
                        onChange={(event) => {
                            patch({ brandOther: event.target.value });
                            onClearError("brand");
                        }}
                        error={errors.brand}
                        disabled={disabled}
                    />
                    <AuthTextField
                        label={locale.cars.modelOtherLabel}
                        placeholder={locale.cars.modelOtherPlaceholder}
                        type="text"
                        value={value.modelOther}
                        onChange={(event) => {
                            patch({ modelOther: event.target.value });
                            onClearError("model");
                        }}
                        error={errors.model}
                        disabled={disabled}
                    />
                </>
            ) : (
                <ComboField
                    label={locale.cars.modelLabel}
                    placeholder={locale.cars.modelPlaceholder}
                    value={value.model}
                    onChange={handleModel}
                    options={asOptions(
                        modelsForBrand(value.brand).map((entry) => entry.name),
                    )}
                    error={errors.model}
                    disabled={disabled || !value.brand}
                />
            )}

            <SelectField
                label={locale.cars.yearLabel}
                placeholder={locale.cars.yearPlaceholder}
                value={value.year}
                onChange={(event) => {
                    patch({ year: event.target.value });
                    onClearError("year");
                }}
                options={asOptions(years.map(String))}
                error={errors.year}
                disabled={disabled || (!freeText && !value.model)}
            />

            <div className="car-fields-divider">
                <span className="car-fields-divider-label">
                    {locale.cars.optionalTitle}
                </span>
            </div>

            <AuthTextField
                label={locale.cars.nicknameLabel}
                placeholder={locale.cars.nicknamePlaceholder}
                type="text"
                value={value.nickname}
                onChange={(event) => {
                    patch({ nickname: event.target.value });
                    onClearError("nickname");
                }}
                error={errors.nickname}
                disabled={disabled}
            />
            {/* Helper under the nickname field: the placeholder is the example,
                this line says WHY you'd fill it in. Storing an empty string
                (or a stray "brand model") makes the placeholder into a lie —
                the Edit-save self-heal in EditCar.tsx keeps the model honest. */}
            <p className="car-fields-hint">{locale.cars.nicknameHint}</p>

            <AuthTextField
                label={locale.cars.plateLabel}
                placeholder={locale.cars.platePlaceholder}
                type="text"
                value={value.plate}
                onChange={(event) => {
                    patch({ plate: event.target.value });
                    onClearError("plate");
                }}
                error={errors.plate}
                disabled={disabled}
            />

            {showOdometer && (
                <>
                    {/* inputMode numeric brings up the digit keypad on a phone
                        without type=number's desktop spinners. */}
                    <AuthTextField
                        label={locale.cars.odometerLabel}
                        placeholder={locale.cars.odometerPlaceholder}
                        type="text"
                        inputMode="numeric"
                        value={value.odometer}
                        onChange={(event) => {
                            patch({ odometer: event.target.value });
                            onClearError("odometer");
                        }}
                        error={errors.odometer}
                        disabled={disabled}
                    />
                    <p className="car-fields-hint">{locale.cars.odometerHint}</p>
                </>
            )}
        </div>
    );
};

export default CarFields;
