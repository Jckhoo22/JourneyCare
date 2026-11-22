import { Plus, ScanLine, Users } from 'lucide-react';
import '../../styles/app-shell.css';
import './HomePage.css';

import TopBar from '../../components/app_shell/TopBar';
import {
    FadeSwap,
    SkeletonCarList,
    SkeletonGroupList,
    SkeletonSummaryStrip,
} from '../../components/app_shell/Skeleton';
import { Button, EmptyState } from '../../components/ui';
import GroupCard from '../../components/groups/GroupCard';
import CarCard from '../../components/cars/CarCard';
import SummaryStrip from '../../components/summary/SummaryStrip';
import { useAuthController } from '../../controller/AuthController';
import { useGroups, useSyncGroupsOwned } from '../../controller/GroupsController';
import {
    tallyByGroup,
    useCarsAcrossGroups,
    useDueNotifications,
} from '../../controller/DueController';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserContext';
import { isOwner, type Group } from '../../model/Group';
import { ROUTES } from '../../constants/routes';
import { greetingForHour } from '../../utils/greeting';

/**
 * Create / Join, rendered as bordered secondary buttons under a populated
 * list. [UX 2a, Home polish]
 *
 * When Auntie already has a group the implicit primary action is tapping
 * her group card — so Create/Join sit as outlined secondaries, not solid
 * teal. There are ZERO solid primary buttons on this screen; the card
 * itself is the primary. R1 holds. Empty state (elsewhere in HomePage)
 * keeps them prominent because there's no card to tap there.
 *
 * Create carries the accent-border variant to hint "this is the default
 * next step for a new owner"; Join uses the neutral secondary variant.
 * Both are still secondary, so the group card wins.
 */
const GroupActions = () => {
    const { locale } = useLanguage();

    return (
        <div className="home-group-actions">
            <Button
                variant="secondary"
                icon={Plus}
                inline
                to={ROUTES.createGroup}
                label={locale.home.createGroup}
                className="home-group-actions-create"
            />
            <Button
                variant="secondary"
                icon={ScanLine}
                inline
                to={ROUTES.joinWithCode}
                label={locale.home.joinGroup}
            />
        </div>
    );
};

interface GroupSectionProps {
    title: string;
    groups: Group[];
    /** Owned groups carry the accent treatment. [Item 5] */
    owned: boolean;
}

/**
 * One titled group section. Renders nothing at all when it has no groups —
 * which is what produces the "only one section shown if the other is empty"
 * behaviour without either section needing its own empty copy. [Item 5]
 */
const GroupSection = ({ title, groups, owned }: GroupSectionProps) => {
    if (groups.length === 0) return null;

    return (
        <section className="home-section">
            <h2 className="home-section-title">{title}</h2>
            <div className="home-group-list stagger-in">
                {groups.map((group) => (
                    <GroupCard key={group.id} group={group} isOwned={owned} />
                ))}
            </div>
        </section>
    );
};

const byName = (a: Group, b: Group) => a.name.localeCompare(b.name);

/** Signed-in landing screen. [H1–H6, Item 5] */
const HomePage = () => {
    const { logout } = useAuthController();
    const { locale } = useLanguage();
    const { user } = useUser();
    const { groups, isLoading, error } = useGroups();

    // Derived on every render from the live snapshot, so an accepted request or
    // a deleted group moves between sections the moment the listener fires —
    // there is no second copy of the list to keep in step. [Item 5]
    const owned = groups.filter((group) => isOwner(group, user?.uid)).sort(byName);
    const joined = groups
        .filter((group) => !isOwner(group, user?.uid))
        .sort(byName);

    const hasGroups = groups.length > 0;

    // One bounded cars listener per group, shared by the strip and the
    // notification detector below — the strip adds no reads of its own. [R3]
    const carsByGroup = useCarsAcrossGroups(groups);
    const { byGroup, total } = tallyByGroup(carsByGroup);

    // A group whose cars haven't arrived yet has no key at all, so this is
    // "still counting" rather than "nothing due". [R3]
    const carsLoading =
        isLoading || Object.keys(carsByGroup).length < groups.length;

    // R4's writer, mounted HERE and nowhere else: home already holds every
    // group's cars, so a single screen owns the stamp and the group and car
    // pages can render status without racing it.
    useDueNotifications(groups, carsByGroup);

    // This screen is the only place that knows the true count, so it's where
    // the Phase 3 counter gets put right. One write, only when it's wrong. [P3b]
    useSyncGroupsOwned(owned.length, !isLoading && !error);

    return (
        <div className="app-page">
            <main className="app-main">
                <TopBar onSignOut={logout} />

                <div className="app-banner home-overview">
                    <h1 className="app-banner-title">
                        {user?.username
                            ? `${greetingForHour(new Date().getHours(), locale.home)}, ${user.username}`
                            : greetingForHour(new Date().getHours(), locale.home)}
                    </h1>

                    <section className="home-summary">
                        {!error && (
                            <FadeSwap
                                isLoading={carsLoading && hasGroups}
                                skeleton={
                                    <SkeletonSummaryStrip
                                        label={locale.due.stripAria}
                                    />
                                }
                            >
                                <SummaryStrip
                                    groups={groups}
                                    byGroup={byGroup}
                                    total={total}
                                    carsByGroup={carsByGroup}
                                    isLoading={carsLoading}
                                />
                            </FadeSwap>
                        )}
                    </section>
                </div>

                {error && <p className="app-error">{error}</p>}

                {!error && hasGroups && (
                    <FadeSwap
                        isLoading={carsLoading}
                        skeleton={<SkeletonCarList label={locale.cars.loading} count={2} />}
                    >
                        {groups.some((group) => carsByGroup[group.id]?.length > 0) && (
                            <section className="home-section" aria-labelledby="home-cars-title">
                                <h2 id="home-cars-title" className="home-section-title">
                                    {locale.groups.carsTitle}
                                </h2>
                                <div className="home-car-list">
                                    {[...owned, ...joined].flatMap((group) =>
                                        (carsByGroup[group.id] ?? []).map((car) => (
                                            <CarCard
                                                key={`${group.id}/${car.id}`}
                                                car={car}
                                                groupId={group.id}
                                                groupName={groups.length > 1 ? group.name : undefined}
                                            />
                                        )),
                                    )}
                                </div>
                            </section>
                        )}
                    </FadeSwap>
                )}

                {/* Skeleton rows rather than a spinner: the list has a known
                    shape, so the layout can settle before the data lands. The
                    skeleton is only shown after ~150ms of sustained loading —
                    a cache hit paints the real list without a flash. [Item 3b] */}
                {!error && (
                    <FadeSwap
                        isLoading={isLoading}
                        skeleton={
                            <SkeletonGroupList label={locale.home.loadingGroups} />
                        }
                    >
                        {hasGroups && (
                            <>
                                <GroupSection
                                    title={locale.home.ownedTitle}
                                    groups={owned}
                                    owned
                                />
                                <GroupSection
                                    title={locale.home.joinedTitle}
                                    groups={joined}
                                    owned={false}
                                />
                                <GroupActions />
                            </>
                        )}
                    </FadeSwap>
                )}

                {/* [H5] Empty state — Users glyph so the empty card doesn't
                    echo the header's app-logo car icon. The empty state is
                    about GROUPS (there are none yet); the placeholder chain
                    for cars still uses lucide Car per CONTEXT.md. */}
                {!isLoading && !error && !hasGroups && (
                    <EmptyState
                        icon={Users}
                        title={locale.home.emptyTitle}
                        body={locale.home.emptyBody}
                        action={
                            <Button
                                variant="primary"
                                icon={Plus}
                                to={ROUTES.createGroup}
                                label={locale.home.createGroup}
                            />
                        }
                        secondaryAction={
                            <Button
                                variant="secondary"
                                icon={ScanLine}
                                to={ROUTES.joinWithCode}
                                label={locale.home.joinGroup}
                            />
                        }
                    />
                )}
            </main>
        </div>
    );
};

export default HomePage;
