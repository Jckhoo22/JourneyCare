import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import "./GroupNameEditor.css";

import { useRenameGroup } from "../../controller/GroupsController";
import { useLanguage } from "../../context/LanguageContext";
import { Button } from "../ui";
import { GROUP_NAME_MAX_LENGTH } from "../../constants/regex";
import type { Group } from "../../model/Group";

interface GroupNameEditorProps {
    group: Group;
    /** Called when the user cancels or a successful save closes the form. */
    onClose: () => void;
}

/**
 * The rename form for a group's name. [G12]
 *
 * ── History ────────────────────────────────────────────────────────────────
 * Before the Manage-group hierarchy pass, this component owned BOTH the
 * heading display and the pencil-icon trigger that swapped it for a form.
 * Manage now has one page title ("Manage group") and the current name lives
 * inside the Group name admin row, whose own "Rename" button opens this
 * form. Ownership of the display moved to the parent; ownership of the
 * write logic stayed here — including the group_renamed notification
 * fan-out inside useRenameGroup, which is untouched.
 */
const GroupNameEditor = ({ group, onClose }: GroupNameEditorProps) => {
    const { locale } = useLanguage();
    const { renameGroup, isRenaming, nameError, clearNameError } =
        useRenameGroup();

    const [draft, setDraft] = useState(group.name);
    const inputRef = useRef<HTMLInputElement>(null);
    const inputId = useId();
    const errorId = `${inputId}-error`;

    // Autofocus once on mount — the form only renders when the parent opens
    // it, so mounting IS opening.
    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const close = () => {
        clearNameError();
        onClose();
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const saved = await renameGroup(group, draft);
        if (saved) close();
    };

    return (
        <form className="group-name-form" onSubmit={handleSubmit} noValidate>
            <label className="group-name-label" htmlFor={inputId}>
                {locale.groups.renameFieldLabel}
            </label>

            <input
                ref={inputRef}
                id={inputId}
                className="group-name-input"
                value={draft}
                onChange={(event) => {
                    setDraft(event.target.value);
                    clearNameError();
                }}
                // Escape backs out — the same key that dismisses the account
                // menu, so the gesture is consistent.
                onKeyDown={(event) => {
                    if (event.key === "Escape") close();
                }}
                maxLength={GROUP_NAME_MAX_LENGTH}
                disabled={isRenaming}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? errorId : undefined}
            />

            {nameError && (
                <span className="group-name-error" id={errorId}>
                    {nameError}
                </span>
            )}

            <div className="group-name-actions">
                <Button
                    type="submit"
                    variant="primary"
                    inline
                    icon={Check}
                    disabled={isRenaming}
                    label={
                        isRenaming
                            ? locale.common.processing
                            : locale.groups.renameSave
                    }
                />
                <Button
                    variant="secondary"
                    inline
                    icon={X}
                    onClick={close}
                    disabled={isRenaming}
                    label={locale.groups.renameCancel}
                />
            </div>
        </form>
    );
};

export default GroupNameEditor;
