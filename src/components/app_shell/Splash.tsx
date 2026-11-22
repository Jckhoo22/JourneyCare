import { Car } from "lucide-react";
import "./Splash.css";

import { useLanguage } from "../../context/LanguageContext";

/**
 * The first thing anyone sees. [Item 3a]
 *
 * Shown only while Firebase is restoring the session — which is also what
 * keeps a returning user from being flashed the login screen: App.tsx will not
 * mount a route until `isAuthLoading` clears, so the router never gets a
 * chance to read "signed out" and redirect to /auth.
 *
 * Deliberately no text beyond the app name: a session restore is usually well
 * under a second, and "Loading Application..." draws the eye to a wait that is
 * mostly already over. The mark pulses instead, and the whole thing fades in
 * after a beat so an instant restore shows nothing at all.
 */
const Splash = () => {
    const { locale } = useLanguage();

    return (
        <div className="splash" role="status" aria-live="polite">
            <div className="splash-inner">
                <div className="splash-mark">
                    <Car size={28} strokeWidth={2} aria-hidden="true" />
                </div>
                <span className="splash-name">{locale.appName}</span>
            </div>
            <span className="splash-sr">{locale.common.loading}</span>
        </div>
    );
};

export default Splash;
