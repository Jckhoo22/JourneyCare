import { Link } from "react-router";
import { Users, ChevronRight } from "lucide-react";
import "./GroupCard.css";

import { groupPath } from "../../constants/routes";
import { memberCount, type Group } from "../../model/Group";
import { useLanguage } from "../../context/LanguageContext";

interface GroupCardProps {
    group: Group;
    /**
     * Marks a group the viewer owns. Purely presentational — it decides a
     * border and a badge, never what the card links to or what can be done
     * with it. Permissions are the rules' job. [Item 5]
     */
    isOwned?: boolean;
}

/**
 * One group in the home list. The whole card is the link target, so it stays
 * comfortably tappable on a phone. [H2, H4]
 */
const GroupCard = ({ group, isOwned = false }: GroupCardProps) => {
    const { locale } = useLanguage();

    const count = memberCount(group);
    const countLabel = (
        count === 1 ? locale.home.memberCount : locale.home.memberCountPlural
    ).replace("{count}", String(count));

    return (
        <Link
            to={groupPath(group.id)}
            className={`group-card ${isOwned ? "group-card-owned" : ""}`}
        >
            <div className="group-card-icon">
                <Users size={20} strokeWidth={2} />
            </div>

            <div className="group-card-body">
                <span className="group-card-name">{group.name}</span>
                <span className="group-card-meta">
                    <span className="group-card-members">{countLabel}</span>
                    {isOwned && (
                        <span className="group-card-badge">
                            {locale.home.ownerBadge}
                        </span>
                    )}
                </span>
            </div>

            <ChevronRight
                size={18}
                strokeWidth={2.5}
                className="group-card-chevron"
            />
        </Link>
    );
};

export default GroupCard;
