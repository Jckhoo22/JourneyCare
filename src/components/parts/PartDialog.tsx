import { useId, useState, type FormEvent } from "react";
import "./PartDialog.css";

import { Button, Modal } from "../ui";
import { useLanguage } from "../../context/LanguageContext";
import {
    emptyPartDraft,
    type PartDraft,
    type PartFieldErrors,
} from "../../controller/PartsController";
import { CUSTOM_TYPE, presetsByGroup } from "../../model/CarCatalogue";

/**
 * Add/Edit part dialog. [Parts shelf redesign]
 *
 * Thin wrapper around the shared `Modal` — this file only owns the FORM,
 * not the modal shell chrome. That means the header (title + close X),
 * the backdrop-click, focus trap, and Esc behaviour all match every
 * other modal that reaches for `Modal`, so a fix there fixes every
 * dialog at once.
 *
 * ── Add vs. Edit ─────────────────────────────────────────────────────
 * `mode` decides the labels; `initialDraft` decides the starting state.
 * `onSubmit` returns a boolean so the dialog can stay open on validation
 * failure and close on success — the parent decides via that return.
 *
 * ── Field layout ─────────────────────────────────────────────────────
 * Type select, optional Label, Cost, Notes. No wrench icons inside
 * inputs — plain inputs match the Settings screen's grammar.
 */
interface PartDialogProps {
    mode: "add" | "edit";
    initialDraft?: PartDraft;
    onSubmit: (draft: PartDraft) => Promise<boolean>;
    onCancel: () => void;
    isSaving: boolean;
    errors: PartFieldErrors;
    clearError: (field: keyof PartFieldErrors) => void;
}

const PartDialog = ({
    mode,
    initialDraft,
    onSubmit,
    onCancel,
    isSaving,
    errors,
    clearError,
}: PartDialogProps) => {
    const { locale } = useLanguage();
    // A stable id ties the footer's submit Button (rendered by Modal
    // outside the <form>) to the form via the standard HTML form= attr.
    const formId = useId();

    const [draft, setDraft] = useState<PartDraft>(
        () => initialDraft ?? emptyPartDraft(),
    );

    const patch = (next: Partial<PartDraft>) =>
        setDraft((current) => ({ ...current, ...next }));

    const isCustom = draft.typeId === CUSTOM_TYPE;

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await onSubmit(draft);
    };

    return (
        <Modal
            title={
                mode === "edit" ? locale.parts.editTitle : locale.parts.addTitle
            }
            onClose={onCancel}
            closeLabel={locale.parts.close}
            isBusy={isSaving}
            footer={
                <>
                    <Button
                        variant="text"
                        label={locale.parts.cancel}
                        onClick={onCancel}
                        disabled={isSaving}
                    />
                    <Button
                        type="submit"
                        variant="primary"
                        inline
                        disabled={isSaving}
                        label={
                            isSaving
                                ? locale.common.processing
                                : mode === "edit"
                                  ? locale.parts.editSaveButton
                                  : locale.parts.saveButton
                        }
                        // The `form` HTML attribute lets a submit button
                        // outside its <form> still submit that form. Modal
                        // renders this Button in a sticky footer sibling
                        // of the form below.
                        form={formId}
                    />
                </>
            }
        >
            <form
                id={formId}
                className="part-dialog-form"
                onSubmit={handleSubmit}
                noValidate
            >
                <label className="part-dialog-field">
                    <span className="part-dialog-label">
                        {locale.parts.typeLabel}
                    </span>
                    <select
                        className="part-dialog-input"
                        value={draft.typeId}
                        onChange={(event) => {
                            patch({ typeId: event.target.value });
                            clearError("typeId");
                        }}
                        disabled={isSaving}
                        aria-invalid={errors.typeId ? true : undefined}
                    >
                        <option value="">{locale.parts.typePlaceholder}</option>
                        {presetsByGroup().map((entry) => (
                            <optgroup
                                key={entry.group.id}
                                label={entry.group.label}
                            >
                                {entry.types.map((type) => (
                                    <option key={type.id} value={type.id}>
                                        {type.label}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    {errors.typeId && (
                        <span className="part-dialog-error">
                            {errors.typeId}
                        </span>
                    )}
                </label>

                {isCustom && (
                    <label className="part-dialog-field">
                        <span className="part-dialog-label">
                            {locale.parts.customLabel}
                        </span>
                        <input
                            type="text"
                            className="part-dialog-input"
                            placeholder={locale.parts.customPlaceholder}
                            value={draft.customName}
                            onChange={(event) => {
                                patch({ customName: event.target.value });
                                clearError("customName");
                            }}
                            disabled={isSaving}
                            aria-invalid={
                                errors.customName ? true : undefined
                            }
                        />
                        {errors.customName && (
                            <span className="part-dialog-error">
                                {errors.customName}
                            </span>
                        )}
                    </label>
                )}

                <label className="part-dialog-field">
                    <span className="part-dialog-label">
                        {locale.parts.partLabelLabel}
                    </span>
                    <input
                        type="text"
                        className="part-dialog-input"
                        placeholder={locale.parts.partLabelPlaceholder}
                        value={draft.label}
                        onChange={(event) =>
                            patch({ label: event.target.value })
                        }
                        disabled={isSaving}
                    />
                    <span className="part-dialog-hint">
                        {locale.parts.partLabelHint}
                    </span>
                </label>

                <label className="part-dialog-field">
                    <span className="part-dialog-label">
                        {locale.parts.costLabel}
                    </span>
                    <input
                        type="text"
                        inputMode="decimal"
                        className="part-dialog-input"
                        placeholder={locale.parts.costPlaceholder}
                        value={draft.cost}
                        onChange={(event) => {
                            patch({ cost: event.target.value });
                            clearError("cost");
                        }}
                        disabled={isSaving}
                        aria-invalid={errors.cost ? true : undefined}
                    />
                    {errors.cost && (
                        <span className="part-dialog-error">{errors.cost}</span>
                    )}
                </label>

                <label className="part-dialog-field">
                    <span className="part-dialog-label">
                        {locale.parts.notesLabel}
                    </span>
                    <input
                        type="text"
                        className="part-dialog-input"
                        placeholder={locale.parts.notesPlaceholder}
                        value={draft.notes}
                        onChange={(event) =>
                            patch({ notes: event.target.value })
                        }
                        disabled={isSaving}
                    />
                </label>
            </form>
        </Modal>
    );
};

export default PartDialog;
