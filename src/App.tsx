import type { ReactElement } from 'react';
import {
    BrowserRouter,
    Navigate,
    Route,
    Routes,
    useLocation,
} from 'react-router';

import OfflineBanner from './components/app_shell/OfflineBanner';
import Splash from './components/app_shell/Splash';
import { UserProvider, useUser } from './context/UserContext';
import { LanguageProvider } from './context/LanguageContext';
import { ToastProvider } from './context/Toast';
import {
    ROUTES,
    authPathWithNext,
    readNext,
    usernamePathWithNext,
    verifyPathWithNext,
} from './constants/routes';
import type { UserProfile } from './model/User';

// Import Pages
import LoginRegister from './pages/LoginRegister/LoginRegister';
import VerifyEmail from './pages/VerifyEmail/VerifyEmail';
import ChooseUsername from './pages/ChooseUsername/ChooseUsername';
import HomePage from './pages/HomePage/HomePage';
import NotificationsPage from './pages/Notifications/NotificationsPage';
import Settings from './pages/Settings/Settings';
import GroupDetail from './pages/GroupDetail/GroupDetail';
import GroupMembers from './pages/GroupMembers/GroupMembers';
import GroupManage from './pages/GroupManage/GroupManage';
import GroupInvite from './pages/GroupInvite/GroupInvite';
import AddCar from './pages/AddCar/AddCar';
import CarDetail from './pages/CarDetail/CarDetail';
import CarMaintenance from './pages/CarDetail/CarMaintenance';
import EditCar from './pages/EditCar/EditCar';
import AddLog from './pages/AddLog/AddLog';
import AddVisit from './pages/AddVisit/AddVisit';
import CreateGroup from './pages/CreateGroup/CreateGroup';
import JoinWithCode from './pages/JoinWithCode/JoinWithCode';
import JoinGroup from './pages/JoinGroup/JoinGroup';

/**
 * Only email/password accounts can be unverified — a social provider has
 * already vouched for the address, so those skip the gate entirely. [A5]
 */
const needsVerification = (user: UserProfile): boolean =>
    user.isPasswordUser && !user.emailVerified;

/**
 * First entry into the app: no `users/{uid}` doc, or one without a username.
 * `username` is populated from Firestore alone, so an account that already has
 * one — including any created before A6 — never sees the screen. [A6]
 */
const needsUsername = (user: UserProfile): boolean => !user.username.trim();

/**
 * Signed-in and verified only. Signed-out visitors are sent to auth with their
 * destination attached, so /join/:groupId/:token survives the round trip — T5
 * depends on this.
 */
const RequireVerified = ({ children }: { children: ReactElement }) => {
    const { user } = useUser();
    const location = useLocation();
    const here = `${location.pathname}${location.search}`;

    if (!user) return <Navigate to={authPathWithNext(here)} replace />;
    if (needsVerification(user)) {
        return <Navigate to={verifyPathWithNext(here)} replace />;
    }
    if (needsUsername(user)) {
        return <Navigate to={usernamePathWithNext(here)} replace />;
    }
    return children;
};

/** The gate itself: only reachable while genuinely unverified. [A4] */
const RequireUnverified = ({ children }: { children: ReactElement }) => {
    const { user } = useUser();
    const location = useLocation();
    const next = readNext(location.search);

    if (!user) return <Navigate to={ROUTES.auth} replace />;
    if (!needsVerification(user)) {
        // Verified now — but the username screen may still be owed.
        if (needsUsername(user)) {
            return <Navigate to={usernamePathWithNext(next)} replace />;
        }
        return <Navigate to={next ?? ROUTES.home} replace />;
    }
    return children;
};

/** The username screen: only reachable while one is genuinely missing. [A6] */
const RequireNoUsername = ({ children }: { children: ReactElement }) => {
    const { user } = useUser();
    const location = useLocation();
    const next = readNext(location.search);

    if (!user) return <Navigate to={ROUTES.auth} replace />;
    // Verification comes first: an unverified account shouldn't be writing a
    // profile yet.
    if (needsVerification(user)) {
        return <Navigate to={verifyPathWithNext(next)} replace />;
    }
    if (!needsUsername(user)) {
        return <Navigate to={next ?? ROUTES.home} replace />;
    }
    return children;
};

/** The auth screen: bounce anyone who is already signed in. */
const PublicOnly = ({ children }: { children: ReactElement }) => {
    const { user } = useUser();
    const location = useLocation();
    const next = readNext(location.search);

    if (user && needsVerification(user)) {
        return <Navigate to={verifyPathWithNext(next)} replace />;
    }
    if (user && needsUsername(user)) {
        return <Navigate to={usernamePathWithNext(next)} replace />;
    }
    if (user) return <Navigate to={next ?? ROUTES.home} replace />;
    return children;
};

const AppRoutes = () => {
    const { isAuthLoading } = useUser();

    // No routing at all until Firebase has restored (or ruled out) the session.
    //
    // This is what stops a signed-in user being flashed the login screen: while
    // `user` is still null-because-unknown, every guard below would read that
    // as signed out and redirect to /auth, and the correction a moment later
    // would be visible. Returning the splash keeps the router unmounted until
    // the answer is real. [Item 3c]
    if (isAuthLoading) return <Splash />;

    return (
        <Routes>
            <Route
                path={ROUTES.auth}
                element={
                    <PublicOnly>
                        <LoginRegister />
                    </PublicOnly>
                }
            />
            <Route
                path={ROUTES.verifyEmail}
                element={
                    <RequireUnverified>
                        <VerifyEmail />
                    </RequireUnverified>
                }
            />
            <Route
                path={ROUTES.chooseUsername}
                element={
                    <RequireNoUsername>
                        <ChooseUsername />
                    </RequireNoUsername>
                }
            />
            <Route
                path={ROUTES.home}
                element={
                    <RequireVerified>
                        <HomePage />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.notifications}
                element={
                    <RequireVerified>
                        <NotificationsPage />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.settings}
                element={
                    <RequireVerified>
                        <Settings />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.createGroup}
                element={
                    <RequireVerified>
                        <CreateGroup />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.joinWithCode}
                element={
                    <RequireVerified>
                        <JoinWithCode />
                    </RequireVerified>
                }
            />
            {/* Declared after the literal /groups/* paths so those win. The
                group screen was split into three in Item 4; /groups/:groupId
                keeps its meaning as the group's front door, so older invite
                links, notification targets and bookmarks still resolve. */}
            <Route
                path={ROUTES.groupDetail}
                element={
                    <RequireVerified>
                        <GroupDetail />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.groupMembers}
                element={
                    <RequireVerified>
                        <GroupMembers />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.groupManage}
                element={
                    <RequireVerified>
                        <GroupManage />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.groupInvite}
                element={
                    <RequireVerified>
                        <GroupInvite />
                    </RequireVerified>
                }
            />
            {/* Declared before the :carId routes; react-router ranks the
                static "new" segment above the dynamic one regardless, so a car
                can never shadow the add form. */}
            <Route
                path={ROUTES.addCar}
                element={
                    <RequireVerified>
                        <AddCar />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.editCar}
                element={
                    <RequireVerified>
                        <EditCar />
                    </RequireVerified>
                }
            />
            {/* Both log routes are declared before the car detail route; the
                static "logs" segment outranks the dynamic :carId either way. */}
            <Route
                path={ROUTES.addLog}
                element={
                    <RequireVerified>
                        <AddLog />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.editLog}
                element={
                    <RequireVerified>
                        <AddLog />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.addVisit}
                element={
                    <RequireVerified>
                        <AddVisit />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.carMaintenance}
                element={
                    <RequireVerified>
                        <CarMaintenance />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.carDetail}
                element={
                    <RequireVerified>
                        <CarDetail />
                    </RequireVerified>
                }
            />
            <Route
                path={ROUTES.join}
                element={
                    <RequireVerified>
                        <JoinGroup />
                    </RequireVerified>
                }
            />
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
        </Routes>
    );
};

const App = () => {
    return (
        <BrowserRouter>
            <UserProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <OfflineBanner />
                        <AppRoutes />
                    </ToastProvider>
                </LanguageProvider>
            </UserProvider>
        </BrowserRouter>
    );
};

export default App;
