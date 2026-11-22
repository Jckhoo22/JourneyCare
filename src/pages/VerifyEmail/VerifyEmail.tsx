import { useCallback, useEffect, useState } from "react";
import { MailCheck, RefreshCw, ArrowRight } from "lucide-react";
import "../../styles/auth-shell.css";
import "./VerifyEmail.css";

import { useAuthController } from "../../controller/AuthController";
import { useLanguage } from "../../context/LanguageContext";
import { useUser } from "../../context/UserContext";
import { Button } from "../../components/ui";

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Blocks an unverified email/password account until they click the link we
 * mailed them. Social sign-ins never land here — their provider vouches for the
 * address. [A4]
 */
const VerifyEmail = () => {
    const { locale } = useLanguage();
    const { user } = useUser();
    const { resendVerification, checkVerification, logout, isLoading } =
        useAuthController();

    // Start on cooldown: register() already sent one on the way in.
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
    const [isResending, setIsResending] = useState(false);

    // Ticks the cooldown down once a second, then stops rescheduling at zero.
    useEffect(() => {
        if (cooldown <= 0) return;

        const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const handleResend = useCallback(async () => {
        if (cooldown > 0 || isResending) return;

        setIsResending(true);
        const sent = await resendVerification();
        setIsResending(false);

        // Only start the clock on a send that actually went out.
        if (sent) setCooldown(RESEND_COOLDOWN_SECONDS);
    }, [cooldown, isResending, resendVerification]);

    // On success the route guard swaps this screen for home — nothing to do here.
    const handleCheck = useCallback(() => {
        void checkVerification();
    }, [checkVerification]);

    const resendLabel =
        cooldown > 0
            ? locale.verify.resendCooldown.replace("{seconds}", String(cooldown))
            : locale.verify.resendButton;

    return (
        <div className="app-container">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <div className="auth-card">
                <div className="icon-header">
                    <div className="icon-box">
                        <MailCheck size={30} strokeWidth={2} />
                    </div>
                </div>

                <div className="text-header">
                    <h1 className="title">{locale.verify.title}</h1>
                    <p className="subtitle">{locale.verify.subtitle}</p>
                    <p className="verify-email-target">{user?.email}</p>
                </div>

                <div className="animate-fade-in">
                    <p className="verify-hint">{locale.verify.hint}</p>

                    <Button
                        variant="primary"
                        icon={isLoading ? undefined : ArrowRight}
                        iconTrailing
                        onClick={handleCheck}
                        disabled={isLoading}
                        label={
                            isLoading
                                ? locale.common.processing
                                : locale.verify.checkButton
                        }
                    />

                    <button
                        className="verify-resend-btn"
                        type="button"
                        onClick={handleResend}
                        disabled={cooldown > 0 || isResending}
                    >
                        <RefreshCw size={16} strokeWidth={2} />
                        <span>{resendLabel}</span>
                    </button>

                    <div className="verify-footer">
                        <button
                            className="verify-signout-link"
                            type="button"
                            onClick={logout}
                        >
                            {locale.verify.signOut}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VerifyEmail;
