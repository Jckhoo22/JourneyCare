import { useParams } from "react-router";
import "../../styles/app-shell.css";

import BackLink from "../../components/BackLink";
import { FadeSwap, SkeletonPanel } from "../../components/app_shell/Skeleton";
import TopBar from "../../components/app_shell/TopBar";
import CarStats from "../../components/cars/CarStats";
import DueList from "../../components/due/DueList";
import { carPath, groupPath, ROUTES } from "../../constants/routes";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { useAuthController } from "../../controller/AuthController";
import { useCar, useCarEditActions } from "../../controller/CarsController";
import { useGroup } from "../../controller/GroupsController";
import { carDisplayName, hasCarEdit } from "../../model/Car";

const CarMaintenance = () => {
    const { groupId, carId } = useParams();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { logout } = useAuthController();
    const { car, isLoading } = useCar(groupId, carId);
    const { group } = useGroup(groupId);
    const mileage = useCarEditActions(groupId);
    const backTo = groupId && carId
        ? carPath(groupId, carId)
        : groupId ? groupPath(groupId) : ROUTES.home;

    return (
        <div className="app-page">
            <div className="blob blob-top" />
            <div className="blob blob-bottom" />
            <main className="app-main">
                <TopBar onSignOut={logout} />
                <BackLink to={backTo} label={car ? carDisplayName(car) : undefined} />
                <header className="app-banner timeline-hero">
                    <div>
                        {car && <p className="timeline-vehicle">{carDisplayName(car)}</p>}
                        <h1 className="app-banner-title">{locale.due.timelineTitle}</h1>
                    </div>
                </header>
                <FadeSwap
                    isLoading={isLoading}
                    skeleton={<SkeletonPanel label={locale.cars.loading} rows={3} />}
                >
                    {car ? (
                        <div className="timeline-content">
                            <CarStats
                                key={car.id}
                                car={car}
                                mileageOnly
                                canEdit={hasCarEdit(car, user?.uid, group?.ownerId ?? "")}
                                onSaveOdometer={(raw, options) => mileage.saveOdometer(car, raw, options)}
                                isSaving={mileage.isSaving}
                                error={mileage.errors.odometer}
                                onClearError={() => mileage.clearError("odometer")}
                            />
                            <DueList car={car} />
                        </div>
                    ) : (
                        <div className="app-empty">
                            <h2 className="app-empty-title">{locale.groups.notFoundTitle}</h2>
                            <p className="app-empty-body">{locale.groups.notFoundBody}</p>
                        </div>
                    )}
                </FadeSwap>
            </main>
        </div>
    );
};

export default CarMaintenance;
