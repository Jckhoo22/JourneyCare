import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import "./DueList.css";

import { carMaintenancePath } from "../../constants/routes";
import { useLanguage } from "../../context/LanguageContext";
import type { Car } from "../../model/Car";
import { dueForCar } from "../../model/Due";
import { tally } from "../../lib/nextDue";

const MaintenanceSummary = ({ car, groupId }: { car: Car; groupId: string }) => {
    const { locale } = useLanguage();
    const labels = locale.due;
    const items = dueForCar(car);
    const { overdue, dueSoon } = tally(items);
    const counts = [
        overdue > 0 ? labels.stripOverdue.replace("{count}", String(overdue)) : null,
        dueSoon > 0 ? labels.stripDueSoon.replace("{count}", String(dueSoon)) : null,
    ].filter(Boolean).join(" · ");
    const status = counts || (items.length === 0
        ? labels.noScheduledServices
        : items.some((item) => item.kmStatusUnknown)
            ? labels.mileageNeeded
            : labels.allGood);

    return (
        <section className="due-summary">
            <div>
                <h2 className="due-summary-title">{labels.maintenanceLabel}</h2>
                <p className="due-summary-detail">{status}</p>
            </div>
            <Link to={carMaintenancePath(groupId, car.id)} className="due-summary-link">
                {labels.viewTimeline}
                <ArrowRight size={16} aria-hidden="true" />
            </Link>
        </section>
    );
};

export default MaintenanceSummary;
