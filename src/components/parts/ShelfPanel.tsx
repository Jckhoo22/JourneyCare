import { useState } from "react";
import "./ShelfPanel.css";

import { Button, ConfirmDialog, OverflowMenu, OverflowMenuItem } from "../ui";
import { useLanguage } from "../../context/LanguageContext";
import {
    emptyPartDraft,
    partToDraft,
    usePartActions,
    type PartDraft,
} from "../../controller/PartsController";
import { findPreset } from "../../model/CarCatalogue";
import { onHandParts, shelfValue, type Part } from "../../model/Part";
import { addVisitPath } from "../../constants/routes";
import { formatRinggit } from "../../utils/money";
import PartDialog from "./PartDialog";

interface ShelfPanelProps {
    groupId: string;
    carId: string;
    parts: Part[];
    canEdit: boolean;
    isAdding: boolean;
    onCloseAdd: () => void;
}

const ShelfPanel = ({ groupId, carId, parts, canEdit, isAdding, onCloseAdd }: ShelfPanelProps) => {
    const { locale } = useLanguage();
    const { addPart, editPart, deletePart, isSaving, errors, clearError } =
        usePartActions(groupId, carId);

    const [editing, setEditing] = useState<{ partId: string; draft: PartDraft } | null>(null);
    const [confirmRemove, setConfirmRemove] = useState<Part | null>(null);

    const shelfItems = onHandParts(parts);
    const total = shelfValue(parts);

    const openEdit = (part: Part) =>
        setEditing({ partId: part.id, draft: partToDraft(part) });
    const closeDialog = () => {
        if (isAdding) onCloseAdd();
        setEditing(null);
    };

    const handleSubmit = async (draft: PartDraft): Promise<boolean> => {
        if (isAdding) {
            const ok = await addPart(draft);
            if (ok) closeDialog();
            return ok;
        }
        if (editing) {
            const target = parts.find((entry) => entry.id === editing.partId);
            if (!target) {
                closeDialog();
                return false;
            }
            const ok = await editPart(target, draft);
            if (ok) closeDialog();
            return ok;
        }
        return false;
    };

    return (
        <>
            {shelfItems.length > 0 && (
                <section className="app-panel shelf-panel">
                    <div className="shelf-header">
                        <h2 className="app-panel-title shelf-header-title">
                            {locale.parts.shelfTitle}
                        </h2>
                        <div className="shelf-total">
                            <span>{locale.parts.shelfValue}</span>
                            <strong>{formatRinggit(total)}</strong>
                        </div>
                    </div>
                    <ul className="shelf-rows">
                        {shelfItems.map((part) => {
                            const preset = findPreset(part.typeId);
                            const typeLabel =
                                part.customName ?? preset?.label ?? part.typeId;
                            const title = part.label ?? typeLabel;
                            const showTypeInSubtitle =
                                !!part.label && part.label !== typeLabel;
                            const boughtOn = part.purchaseDate
                                ? locale.parts.boughtOn.replace(
                                      "{date}",
                                      part.purchaseDate.toDate().toLocaleDateString(
                                          undefined,
                                          {
                                              day: "numeric",
                                              month: "short",
                                              year: "numeric",
                                          },
                                      ),
                                  )
                                : "";

                            const subtitleParts = [
                                showTypeInSubtitle ? typeLabel : null,
                                boughtOn,
                            ].filter(Boolean);

                            return (
                                <li key={part.id} className="shelf-row">
                                    <div className="shelf-row-heading">
                                        <h3 className="shelf-row-title">
                                            {title}
                                        </h3>
                                        <span className="shelf-row-price">
                                            {formatRinggit(part.cost)}
                                        </span>
                                    </div>
                                    <div className="shelf-row-footer">
                                        {subtitleParts.length > 0 && (
                                            <span className="shelf-row-subtitle">
                                                {subtitleParts.join(" · ")}
                                            </span>
                                        )}
                                        {canEdit && (
                                            <div className="shelf-row-actions">
                                                <Button
                                                    variant="secondary"
                                                    inline
                                                    to={`${addVisitPath(groupId, carId)}?installingPartId=${part.id}`}
                                                    label={locale.parts.install}
                                                    className="shelf-row-install"
                                                />
                                                <OverflowMenu
                                                    label={`${locale.parts.moreOptions} · ${title}`}
                                                >
                                                    <OverflowMenuItem
                                                        onSelect={() => openEdit(part)}
                                                    >
                                                        {locale.parts.edit}
                                                    </OverflowMenuItem>
                                                    <OverflowMenuItem
                                                        variant="danger"
                                                        onSelect={() =>
                                                            setConfirmRemove(part)
                                                        }
                                                    >
                                                        {locale.parts.remove}
                                                    </OverflowMenuItem>
                                                </OverflowMenu>
                                            </div>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {canEdit && (isAdding || editing) && (
                <PartDialog
                    mode={isAdding ? "add" : "edit"}
                    initialDraft={
                        isAdding ? emptyPartDraft() : editing?.draft ?? emptyPartDraft()
                    }
                    onSubmit={handleSubmit}
                    onCancel={closeDialog}
                    isSaving={isSaving}
                    errors={errors}
                    clearError={clearError}
                />
            )}

            {confirmRemove && (
                <ConfirmDialog
                    title={locale.parts.removeTitle}
                    prompt={locale.parts.removeConfirm.replace(
                        "{label}",
                        confirmRemove.label ??
                            findPreset(confirmRemove.typeId)?.label ??
                            confirmRemove.typeId,
                    )}
                    confirmLabel={locale.parts.removeYes}
                    cancelLabel={locale.parts.cancel}
                    isBusy={isSaving}
                    onConfirm={async () => {
                        const target = confirmRemove;
                        const ok = await deletePart(target);
                        if (ok) setConfirmRemove(null);
                    }}
                    onCancel={() => setConfirmRemove(null)}
                />
            )}
        </>
    );
};

export default ShelfPanel;
