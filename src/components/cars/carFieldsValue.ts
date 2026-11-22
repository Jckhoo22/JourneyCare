import type { Car } from "../../model/Car";
import {
    brandNames,
    findModel,
    isOtherBrand,
    OTHER_BRAND,
} from "../../model/CarCatalogue";

/**
 * The car form's value, and the conversions in and out of it. [C2, C3, C8]
 *
 * Split from CarFields.tsx so that file exports only its component — the
 * fast-refresh boundary — but also because these are the parts worth testing on
 * their own: the "Other" round trip below is easy to get wrong and invisible
 * until someone edits a car the catalogue doesn't know.
 */

export interface CarFieldsValue {
    brand: string;
    /** Free text, used only when brand is "Other". */
    brandOther: string;
    model: string;
    modelOther: string;
    year: string;
    nickname: string;
    plate: string;
    /** Add-car only; the car page owns the odometer after that. [C9] */
    odometer: string;
}

export const EMPTY_CAR_FIELDS: CarFieldsValue = {
    brand: "",
    brandOther: "",
    model: "",
    modelOther: "",
    year: "",
    nickname: "",
    plate: "",
    odometer: "",
};

/**
 * Seeds the form from an existing car.
 *
 * A car whose make isn't in the bundled catalogue — anything added through the
 * "Other" escape, or a model retired from the list since — has to come back as
 * "Other" with its text preserved. Without this, opening the edit form to
 * change a plate would silently blank the make.
 */
export const carToFields = (car: Car): CarFieldsValue => {
    const knownBrand = brandNames().includes(car.brand) && !isOtherBrand(car.brand);
    const knownModel = knownBrand && Boolean(findModel(car.brand, car.model));

    return {
        brand: knownModel ? car.brand : OTHER_BRAND,
        brandOther: knownModel ? "" : car.brand,
        model: knownModel ? car.model : "",
        modelOther: knownModel ? "" : car.model,
        year: car.year ? String(car.year) : "",
        nickname: car.nickname ?? "",
        plate: car.plate ?? "",
        odometer: car.odometer !== undefined ? String(car.odometer) : "",
    };
};

/** What actually gets written — the picker's value, or the free text. */
export const resolvedBrand = (value: CarFieldsValue): string =>
    isOtherBrand(value.brand) ? value.brandOther : value.brand;

export const resolvedModel = (value: CarFieldsValue): string =>
    isOtherBrand(value.brand) ? value.modelOther : value.model;
