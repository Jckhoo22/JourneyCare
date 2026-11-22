import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import "./OfflineBanner.css";

import { useLanguage } from "../../context/LanguageContext";

/**
 * Tells the user when the browser has lost the network.
 *
 * Service transactions need a connection. The banner explains that before
 * users try to save, and the submit handlers keep the draft available.
 */
const OfflineBanner = () => {
    const { locale } = useLanguage();
    const [isOffline, setIsOffline] = useState(
        typeof navigator !== "undefined" && !navigator.onLine,
    );

    useEffect(() => {
        const goOnline = () => setIsOffline(false);
        const goOffline = () => setIsOffline(true);

        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="offline-banner" role="status">
            <WifiOff size={15} strokeWidth={2.5} />
            <span>{locale.common.offline}</span>
        </div>
    );
};

export default OfflineBanner;
