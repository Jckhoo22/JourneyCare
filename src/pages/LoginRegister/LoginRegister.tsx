// The floating action button that used to sit bottom-right went with the
// design refresh: it had no onClick, so it was a 48px target that did nothing
// but sit over the form on a phone.
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Mail, Lock, Car, ArrowRight } from 'lucide-react';
import "../../styles/auth-shell.css";
import "./LoginRegister.css";

import AuthTextField from "../../components/login_register/AuthTextField";
import GoogleButton from "../../components/login_register/GoogleButton";
import { Button } from "../../components/ui";

import { useAuthController } from "../../controller/AuthController";
import { useLanguage } from "../../context/LanguageContext";

const LoginRegister = () => {
    const { locale } = useLanguage();
    const {
        activeTab,
        toggleTab,
        isLoading,
        signIn,
        register,
        googleSignIn,
        sendPasswordReset,
        errors,
        clearError,
    } = useAuthController();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const isLogin = activeTab === 'login';
    const content = isLogin ? locale.login : locale.register;
    const fields = locale.fields;

    const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value);
        clearError('email');
    };

    const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value);
        clearError('password');
    };

    const handleConfirmPasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
        setConfirmPassword(e.target.value);
        clearError('confirmPassword');
    };

    const handleTabSwitch = (tab: 'login' | 'register') => {
        toggleTab(tab);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
    };

    // Validation and error mapping both live in the controller now.
    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (isLogin) {
            await signIn(email, password);
        } else {
            await register({ email, password, confirmPassword });
        }
    };

    return (
        <div className="app-container">
            <div className="blob blob-top"></div>
            <div className="blob blob-bottom"></div>

            <div className="auth-card">
                <div className="icon-header">
                    <div className="icon-box">
                        <Car size={30} strokeWidth={2} />
                    </div>
                </div>

                <div className="text-header">
                    <h1 className="title">{content.welcomeTitle}</h1>
                    <p className="subtitle">{content.subtitle}</p>
                </div>

                <div className="tab-container">
                    <div className={`tab-indicator ${isLogin ? 'pos-left' : 'pos-right'}`}></div>
                    <button
                        onClick={() => handleTabSwitch('login')}
                        className={`tab-btn ${isLogin ? 'active' : ''}`}
                    >
                        {locale.login.tabTitle}
                    </button>
                    <button
                        onClick={() => handleTabSwitch('register')}
                        className={`tab-btn ${!isLogin ? 'active' : ''}`}
                    >
                        {locale.register.tabTitle}
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="auth-form animate-fade-in" noValidate>
                    {/* No username field here — it's collected once, on its own
                        screen, after verification / first social sign-in. [A6] */}
                    <AuthTextField
                        label={fields.emailLabel}
                        placeholder={fields.emailPlaceholder}
                        type="email"
                        icon={Mail}
                        value={email}
                        onChange={handleEmailChange}
                        error={errors.email}
                        autoComplete="email"
                    />

                    <AuthTextField
                        label={fields.passwordLabel}
                        placeholder={isLogin ? fields.passwordPlaceholder : fields.createPasswordPlaceholder}
                        type="password"
                        isPassword={true}
                        icon={Lock}
                        value={password}
                        onChange={handlePasswordChange}
                        error={errors.password}
                        autoComplete={isLogin ? "current-password" : "new-password"}
                    />

                    {/* Sign Up only — guards against a typo'd password. [A3] */}
                    {!isLogin && (
                        <AuthTextField
                            label={fields.confirmPasswordLabel}
                            placeholder={fields.confirmPasswordPlaceholder}
                            type="password"
                            isPassword={true}
                            icon={Lock}
                            value={confirmPassword}
                            onChange={handleConfirmPasswordChange}
                            error={errors.confirmPassword}
                            autoComplete="new-password"
                        />
                    )}

                    <div className={`forgot-wrapper ${isLogin ? 'show' : 'hide'}`}>
                        <button
                            type="button"
                            className="forgot-link"
                            onClick={() => sendPasswordReset(email)}
                            disabled={isLoading}
                        >
                            {locale.login.forgotPassword}
                        </button>
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        icon={isLoading ? undefined : ArrowRight}
                        iconTrailing
                        disabled={isLoading}
                        label={isLoading ? locale.common.processing : content.submitButton}
                    />

                    {/* Google is the only social provider — no Apple, no
                        Facebook, no phone. [A8] */}
                    <GoogleButton onClick={googleSignIn} disabled={isLoading} />
                </form>
            </div>
        </div>
    );
};

export default LoginRegister;
