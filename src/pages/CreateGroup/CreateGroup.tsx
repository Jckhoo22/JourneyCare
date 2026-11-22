import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Users, ArrowRight } from "lucide-react";
import "./CreateGroup.css";

import CardShell from "../../components/app_shell/CardShell";
import AuthTextField from "../../components/login_register/AuthTextField";
import { Button } from "../../components/ui";
import { useGroupActions } from "../../controller/GroupsController";
import { useLanguage } from "../../context/LanguageContext";
import { ROUTES, groupPath } from "../../constants/routes";

/** Create a group, seeded with the creator as sole member and owner. [G1] */
const CreateGroup = () => {
    const { locale } = useLanguage();
    const navigate = useNavigate();
    const { createGroup, isSaving, nameError, clearNameError } = useGroupActions();

    const [name, setName] = useState("");

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setName(event.target.value);
        clearNameError();
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const groupId = await createGroup(name);
        // Straight into the group we just made. [G1]
        if (groupId) navigate(groupPath(groupId), { replace: true });
    };

    return (
        <CardShell
            icon={Users}
            title={locale.groups.createTitle}
            subtitle={locale.groups.createSubtitle}
            backLink={{ to: ROUTES.home, label: locale.common.home }}
        >
            <form onSubmit={handleSubmit} className="animate-fade-in" noValidate>
                {/* No leading icon — CardShell screens carry plain inputs;
                    the icon inside the field was decorative and made the
                    value read as placeholder. [Shell polish] */}
                <AuthTextField
                    label={locale.groups.nameLabel}
                    placeholder={locale.groups.namePlaceholder}
                    type="text"
                    value={name}
                    onChange={handleChange}
                    error={nameError}
                    disabled={isSaving}
                />

                {/* Short hint under the field: says what this action
                    actually does. Auntie has never created a group and
                    won't guess what happens next from "Create group"
                    alone. [UX tidy pass] */}
                <p className="create-group-hint">{locale.groups.nameHint}</p>

                <Button
                    type="submit"
                    variant="primary"
                    icon={isSaving ? undefined : ArrowRight}
                    iconTrailing
                    disabled={isSaving}
                    label={
                        isSaving
                            ? locale.common.processing
                            : locale.groups.createButton
                    }
                />
            </form>
        </CardShell>
    );
};

export default CreateGroup;
