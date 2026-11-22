import { useCallback, useEffect, useState } from "react";
import {
    Timestamp,
    collection,
    deleteDoc,
    deleteField,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";

import { db } from "../configurations/firebase-config";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/Toast";
import { useUser } from "../context/UserContext";
import { parseLocalDate, todayInputValue } from "../model/Log";
import {
    toPart,
    type Part,
    type PartDoc,
} from "../model/Part";
import { toMoney } from "../utils/money";
import {
    getErrorCode,
    getFirebaseErrorMessage,
} from "../utils/firebaseErrorMapper";

/** Bounded, per the read-amplification lesson. A family shelf isn't large. */
const PARTS_PAGE_SIZE = 50;

/**
 * The parts subcollection of one car. [PRT1, PRT2]
 *
 * Live listener so the shelf reflects an install or a purchase without a
 * page reload. Bounded at 50 by convention (see the notification list and
 * the log history); the shelf legitimately has no upper cap the way logs do,
 * but 50 is far past what a family holds.
 */
export const useParts = (
    groupId: string | undefined,
    carId: string | undefined,
): { parts: Part[]; isLoading: boolean; error: string | null } => {
    const [state, setState] = useState<{
        parts: Part[];
        error: string | null;
        key: string;
    } | null>(null);
    const key = `${groupId ?? ""}/${carId ?? ""}`;

    useEffect(() => {
        if (!groupId || !carId) return;

        const listQuery = query(
            collection(db, "groups", groupId, "cars", carId, "parts"),
            orderBy("createdAt", "desc"),
            limit(PARTS_PAGE_SIZE),
        );

        const unsubscribe = onSnapshot(
            listQuery,
            (snapshot) => {
                setState({
                    key,
                    parts: snapshot.docs.map((entry) =>
                        toPart(entry.id, entry.data() as Partial<PartDoc>),
                    ),
                    error: null,
                });
            },
            (error) => {
                console.error("Parts listener error:", error);
                setState({
                    key,
                    parts: [],
                    error: getFirebaseErrorMessage(getErrorCode(error)),
                });
            },
        );

        return () => unsubscribe();
    }, [carId, groupId, key]);

    const isCurrent = state !== null && state.key === key;
    return {
        parts: isCurrent ? state.parts : [],
        isLoading: !isCurrent,
        error: isCurrent ? state.error : null,
    };
};

/** What the add-part form collects. Strings — the form owns raw input. */
export interface PartDraft {
    typeId: string;
    customName: string;
    label: string;
    cost: string;
    /** `YYYY-MM-DD`, parsed as LOCAL midnight. */
    purchaseDate: string;
    notes: string;
}

export const emptyPartDraft = (): PartDraft => ({
    typeId: "",
    customName: "",
    label: "",
    cost: "",
    purchaseDate: todayInputValue(),
    notes: "",
});

export interface PartFieldErrors {
    typeId: string;
    customName: string;
    cost: string;
    purchaseDate: string;
}

const NO_PART_ERRORS: PartFieldErrors = {
    typeId: "",
    customName: "",
    cost: "",
    purchaseDate: "",
};

export const resolvePartDraft = (
    draft: PartDraft,
    locale: ReturnType<typeof useLanguage>["locale"],
): { resolved: Omit<PartDoc, "purchaseDate" | "createdAt" | "status" | "createdBy"> & { purchaseDate: Date } | null; errors: PartFieldErrors } => {
    const errors = { ...NO_PART_ERRORS };

    const typeId = draft.typeId.trim();
    if (!typeId) errors.typeId = locale.errors.required;

    const customName = draft.customName.trim();
    if (typeId === "custom" && !customName) {
        errors.customName = locale.errors.required;
    }

    const rawCost = draft.cost.trim().replace(/[\s,]/g, "");
    const cost = Number(rawCost);
    if (!rawCost) errors.cost = locale.errors.required;
    else if (!Number.isFinite(cost) || cost < 0) errors.cost = locale.errors.costInvalid;

    const purchaseDate = parseLocalDate(draft.purchaseDate);
    if (!purchaseDate) errors.purchaseDate = locale.errors.required;
    else if (purchaseDate.getTime() > Date.now())
        errors.purchaseDate = locale.errors.dateFuture;

    if (Object.values(errors).some(Boolean) || !purchaseDate) {
        return { resolved: null, errors };
    }

    return {
        errors,
        resolved: {
            typeId,
            ...(typeId === "custom" ? { customName } : {}),
            ...(draft.label.trim() ? { label: draft.label.trim() } : {}),
            cost: toMoney(cost),
            purchaseDate,
            ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        },
    };
};

interface UsePartActionsResult {
    /** Add an on-hand part. [PRT2, PRT3] */
    addPart: (draft: PartDraft) => Promise<boolean>;
    /**
     * Edit an on-hand part in place. Same doc, same createdBy/createdAt,
     * shape validated by the rules' `isShelfEdit` branch. Cost is FREE to
     * change while the part is on the shelf — it enters the denorm only
     * at install time (decision #25). [PRT2, PRT7]
     *
     * NOT permitted on installed parts. The rules refuse it via
     * `isShelfEdit`'s `resource.data.status == 'on_hand'` guard, but the
     * client refuses first so the failure is a helpful toast rather than
     * a permission-denied.
     */
    editPart: (part: Part, draft: PartDraft) => Promise<boolean>;
    /**
     * Delete an ON-HAND part. Free operation — no denorm touched. [PRT6]
     * Installed parts must be deleted by deleting the linked log instead.
     */
    deletePart: (part: Part) => Promise<boolean>;
    isSaving: boolean;
    errors: PartFieldErrors;
    clearError: (field: keyof PartFieldErrors) => void;
}

export const usePartActions = (
    groupId: string | undefined,
    carId: string | undefined,
): UsePartActionsResult => {
    const { user } = useUser();
    const { addToast } = useToast();
    const { locale } = useLanguage();
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<PartFieldErrors>(NO_PART_ERRORS);

    const clearError = useCallback((field: keyof PartFieldErrors) => {
        setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
    }, []);

    const addPart = useCallback(
        async (draft: PartDraft): Promise<boolean> => {
            if (!groupId || !carId || !user?.uid) return false;

            const { resolved, errors: found } = resolvePartDraft(draft, locale);
            setErrors(found);
            if (!resolved) return false;

            setIsSaving(true);
            try {
                const partRef = doc(
                    collection(db, "groups", groupId, "cars", carId, "parts"),
                );
                await setDoc(partRef, {
                    ...resolved,
                    purchaseDate: Timestamp.fromDate(resolved.purchaseDate),
                    status: "on_hand",
                    createdBy: user.uid,
                    createdAt: serverTimestamp(),
                } satisfies PartDoc);
                addToast(locale.parts.added, "success");
                return true;
            } catch (error: unknown) {
                console.error("Add part error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, carId, groupId, locale, user],
    );

    const editPart = useCallback(
        async (part: Part, draft: PartDraft): Promise<boolean> => {
            if (!groupId || !carId) return false;

            // The rules would refuse this via isShelfEdit's on_hand guard,
            // but a client-side check turns "permission denied" into a
            // readable toast.
            if (part.status !== "on_hand") {
                addToast(locale.parts.editInstalled, "error");
                return false;
            }

            const { resolved, errors: found } = resolvePartDraft(draft, locale);
            setErrors(found);
            if (!resolved) return false;

            setIsSaving(true);
            try {
                // Only touched fields, plus deleteField() for optional
                // fields cleared to empty. createdBy/createdAt/status stay
                // untouched — the rules pin them via isShelfEdit.
                const patch: Record<string, unknown> = {
                    typeId: resolved.typeId,
                    cost: resolved.cost,
                    purchaseDate: Timestamp.fromDate(resolved.purchaseDate),
                };
                if (resolved.customName) {
                    patch.customName = resolved.customName;
                } else {
                    patch.customName = deleteField();
                }
                if (resolved.label) {
                    patch.label = resolved.label;
                } else {
                    patch.label = deleteField();
                }
                if (resolved.notes) {
                    patch.notes = resolved.notes;
                } else {
                    patch.notes = deleteField();
                }

                await updateDoc(
                    doc(
                        db,
                        "groups",
                        groupId,
                        "cars",
                        carId,
                        "parts",
                        part.id,
                    ),
                    patch,
                );
                addToast(locale.parts.updated, "success");
                return true;
            } catch (error: unknown) {
                console.error("Edit part error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, carId, groupId, locale],
    );

    const deletePart = useCallback(
        async (part: Part): Promise<boolean> => {
            if (!groupId || !carId) return false;

            // Only on-hand parts are free to delete. Installed parts require
            // deleting the linked log, which handles the reversal in batch.
            if (part.status !== "on_hand") {
                addToast(locale.parts.deleteInstalled, "error");
                return false;
            }

            setIsSaving(true);
            try {
                await deleteDoc(
                    doc(
                        db,
                        "groups",
                        groupId,
                        "cars",
                        carId,
                        "parts",
                        part.id,
                    ),
                );
                addToast(locale.parts.deleted, "info");
                return true;
            } catch (error: unknown) {
                console.error("Delete part error:", error);
                addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [addToast, carId, groupId, locale],
    );

    return { addPart, editPart, deletePart, isSaving, errors, clearError };
};

/**
 * Turns a Part document back into a PartDraft for the edit dialog.
 *
 * Mirrors `emptyPartDraft` — every field is a string suited to a form
 * input. `purchaseDate` becomes YYYY-MM-DD via `todayInputValue`, which
 * accepts any Date so the same formatter serves the create and edit paths.
 */
export const partToDraft = (part: Part): PartDraft => ({
    typeId: part.typeId,
    customName: part.customName ?? "",
    label: part.label ?? "",
    cost: part.cost > 0 ? String(part.cost) : "",
    purchaseDate: part.purchaseDate
        ? todayInputValue(part.purchaseDate.toDate())
        : todayInputValue(),
    notes: part.notes ?? "",
});
