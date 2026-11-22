import { useCallback, useEffect, useState } from "react";
import {
    createUserWithEmailAndPassword,
    getRedirectResult,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    signOut as firebaseSignOut,
    updateProfile,
    type ActionCodeSettings,
} from "firebase/auth";

import { auth, googleAuthProvider } from "../configurations/firebase-config";
import { useUser } from "../context/UserContext";
import { useToast } from "../context/Toast";
import { useLanguage } from "../context/LanguageContext";
import { EMAIL_REGEX, PASSWORD_REGEX, isValidUsername } from "../constants/regex";
import { ROUTES } from "../constants/routes";
import { preferredGoogleSignInMode } from "../utils/authMode";
import { renameUser, saveUsername } from "./userProfile";
import {
    getErrorCode,
    getFirebaseErrorMessage,
} from "../utils/firebaseErrorMapper";

export type AuthTab = "login" | "register";

export interface AuthFieldErrors {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}

/** Sign Up collects no username — that lands on its own screen. [A6] */
export interface RegisterInput {
    email: string;
    password: string;
    confirmPassword: string;
}

const NO_ERRORS: AuthFieldErrors = {
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
};

/**
 * Popup failures worth retrying as a full-page redirect. A user who closed the
 * popup themselves is not in this set — that's a deliberate cancel. [A5]
 */
const POPUP_FALLBACK_CODES = new Set([
    "auth/popup-blocked",
    "auth/operation-not-supported-in-this-environment",
]);

/** Sends verification / reset links back to our own app rather than a bare Firebase page. */
const continueToApp = (): ActionCodeSettings => ({
    url: `${window.location.origin}${ROUTES.auth}`,
    handleCodeInApp: false,
});

/**
 * All auth logic for the app. Validation lives here and nowhere else — pages
 * render `errors` and call these actions.
 *
 * Routing is intentionally absent: App.tsx's guards derive the destination from
 * session state, so signing in, verifying, or signing out moves the user
 * without this hook navigating anywhere.
 */
export const useAuthController = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<AuthTab>("login");
    const [errors, setErrors] = useState<AuthFieldErrors>(NO_ERRORS);

    const { user, refreshUser } = useUser();
    const { addToast } = useToast();
    const { locale } = useLanguage();

    // Completes a Google sign-in that fell back to redirect. The session itself
    // is restored by UserContext's listener; this is here to surface failures.
    useEffect(() => {
        getRedirectResult(auth).catch((error: unknown) => {
            const code = getErrorCode(error);
            if (code) addToast(getFirebaseErrorMessage(code), "error");
        });
    }, [addToast]);

    const clearError = useCallback((field: keyof AuthFieldErrors) => {
        setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
    }, []);

    const resetErrors = useCallback(() => setErrors(NO_ERRORS), []);

    // ------------------------------------------------------------------
    //  VALIDATION (single home — pages no longer duplicate this)
    // ------------------------------------------------------------------
    const validateLogin = (email: string, password: string): boolean => {
        const next = { ...NO_ERRORS };

        if (!email) next.email = locale.errors.required;
        else if (!EMAIL_REGEX.test(email)) next.email = locale.errors.invalidEmail;

        if (!password) next.password = locale.errors.required;

        setErrors(next);
        return !next.email && !next.password;
    };

    const validateRegister = (input: RegisterInput): boolean => {
        const next = { ...NO_ERRORS };

        if (!input.email) next.email = locale.errors.required;
        else if (!EMAIL_REGEX.test(input.email))
            next.email = locale.errors.invalidEmail;

        if (!input.password) next.password = locale.errors.required;
        else if (!PASSWORD_REGEX.test(input.password))
            next.password = locale.errors.weakPassword;

        if (!input.confirmPassword) next.confirmPassword = locale.errors.required;
        else if (input.confirmPassword !== input.password)
            next.confirmPassword = locale.errors.passwordMismatch;

        setErrors(next);
        return !Object.values(next).some(Boolean);
    };

    // ------------------------------------------------------------------
    //  GOOGLE SIGN IN  [A1, A5]
    // ------------------------------------------------------------------
    /**
     * Redirect on a phone, popup on a desktop — but only where redirect can
     * actually complete.
     *
     * `preferredGoogleSignInMode()` answers that second half: redirect depends
     * on Firebase's auth handler being same-origin with the app, and with this
     * project's authDomain (`…firebaseapp.com`) split from its hosting domain
     * (`…web.app`) it currently isn't. So today every device takes the popup
     * path, and the redirect branch switches itself on the moment authDomain
     * moves to the app's own host. The reasoning is in utils/authMode.ts and
     * the two console steps are in docs/auth-redirect.md.
     */
    const googleSignIn = async (): Promise<void> => {
        setIsLoading(true);
        resetErrors();

        try {
            if (preferredGoogleSignInMode() === "redirect") {
                // Leaves the page. Nothing after this runs; the session is
                // picked up by UserContext's listener on the way back, and
                // getRedirectResult() below surfaces any failure.
                await signInWithRedirect(auth, googleAuthProvider);
                return;
            }

            const result = await signInWithPopup(auth, googleAuthProvider);
            // The users/{uid} doc for a first-time social sign-in is created by
            // UserContext as it maps the session. [A5]
            addToast(`Welcome ${result.user.displayName || "User"}!`, "success");
        } catch (error: unknown) {
            const code = getErrorCode(error);

            if (code && POPUP_FALLBACK_CODES.has(code)) {
                try {
                    // A blocked popup leaves redirect as the only route left,
                    // even where it's second choice.
                    await signInWithRedirect(auth, googleAuthProvider);
                    return;
                } catch (redirectError: unknown) {
                    addToast(
                        getFirebaseErrorMessage(getErrorCode(redirectError)),
                        "error",
                    );
                    return;
                }
            }

            console.error("Google Error:", code);
            addToast(getFirebaseErrorMessage(code), "error");
        } finally {
            setIsLoading(false);
        }
    };

    // ------------------------------------------------------------------
    //  REGISTER  [A3]
    // ------------------------------------------------------------------
    const register = async (input: RegisterInput): Promise<void> => {
        if (!validateRegister(input)) {
            addToast("Please fix the errors in the form.", "error");
            return;
        }

        setIsLoading(true);

        try {
            const credential = await createUserWithEmailAndPassword(
                auth,
                input.email,
                input.password,
            );

            // No profile write here: `users/{uid}` is created on the username
            // screen, which this account reaches after verifying. [A6]
            await sendEmailVerification(credential.user, continueToApp());
            addToast(locale.verify.resendSuccess, "success");
        } catch (error: unknown) {
            const code = getErrorCode(error);
            console.error("Register Error:", code);

            const message = getFirebaseErrorMessage(code);
            addToast(message, "error");

            if (code === "auth/email-already-in-use" || code === "auth/invalid-email") {
                setErrors((prev) => ({ ...prev, email: message }));
            } else if (code === "auth/weak-password") {
                setErrors((prev) => ({ ...prev, password: message }));
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ------------------------------------------------------------------
    //  USERNAME  [A6]
    // ------------------------------------------------------------------
    /**
     * Saves the display name chosen on the one-time username screen, creating
     * or completing `users/{uid}`. Returns false if it didn't stick.
     */
    const chooseUsername = async (rawUsername: string): Promise<boolean> => {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return false;

        const username = rawUsername.trim();
        if (!isValidUsername(username)) {
            setErrors((prev) => ({
                ...prev,
                username: username
                    ? locale.errors.invalidUsername
                    : locale.errors.required,
            }));
            return false;
        }

        setIsLoading(true);
        try {
            await saveUsername(firebaseUser, username);
            // Keep the auth record's display name in step with the profile.
            await updateProfile(firebaseUser, { displayName: username });

            // Refreshing puts the username in the session, which is what lets
            // the guard release this user to home.
            await refreshUser();
            addToast(locale.username.saved.replace("{username}", username), "success");
            return true;
        } catch (error: unknown) {
            console.error("Username Error:", error);
            addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // ------------------------------------------------------------------
    //  RENAME  [SET2, D2]
    // ------------------------------------------------------------------
    /**
     * Changes the display name from Settings.
     *
     * Deliberately NOT the same function as `chooseUsername`. They validate
     * identically and both end in `refreshUser`, but the write underneath is a
     * different shape: the first-run screen writes one document for a user who
     * is in no groups yet, while this one has to fan the new name out to every
     * group that holds a copy of it (see `renameUser`). Collapsing them into
     * one call is how the fan-out gets forgotten.
     *
     * A no-op rename returns early rather than writing. It would be harmless —
     * the rules admit it and the values are identical — but it costs a read of
     * every group the user is in to achieve nothing.
     */
    // Note: language persistence used to live here as `changeLanguage`,
    // which awaited the Firestore write and then refreshed the session.
    // That coupled the UI's language flip to a Firestore round-trip and
    // felt bad on 3G. It now lives inside LanguageContext as a
    // fire-and-forget write off the same setLanguage the pre-auth
    // screens already use — see the "Language change spec" note in
    // LanguageContext.tsx.

    const renameUsername = async (rawUsername: string): Promise<boolean> => {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return false;

        const username = rawUsername.trim();
        if (!isValidUsername(username)) {
            setErrors((prev) => ({
                ...prev,
                username: username
                    ? locale.errors.invalidUsername
                    : locale.errors.required,
            }));
            return false;
        }

        if (username === user?.username) return true;

        setIsLoading(true);
        try {
            await renameUser(firebaseUser, username);
            await updateProfile(firebaseUser, { displayName: username });
            await refreshUser();
            addToast(locale.settings.nameSaved, "success");
            return true;
        } catch (error: unknown) {
            console.error("Rename Error:", error);
            addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // ------------------------------------------------------------------
    //  SIGN IN  [A3]
    // ------------------------------------------------------------------
    const signIn = async (email: string, password: string): Promise<void> => {
        if (!validateLogin(email, password)) {
            addToast("Please fix the errors in the form.", "error");
            return;
        }

        setIsLoading(true);

        try {
            const credential = await signInWithEmailAndPassword(auth, email, password);

            if (credential.user.emailVerified) {
                addToast("Welcome back!", "success");
            } else {
                // The guard takes it from here and lands on the gate. [A4]
                addToast(locale.verify.stillWaiting, "info");
            }
        } catch (error: unknown) {
            const code = getErrorCode(error);
            console.error("Login Error:", code);
            addToast(getFirebaseErrorMessage(code), "error");
        } finally {
            setIsLoading(false);
        }
    };

    // ------------------------------------------------------------------
    //  EMAIL VERIFICATION  [A4]
    // ------------------------------------------------------------------
    /** Resends the verification link. Returns false if there's nobody to send to. */
    const resendVerification = async (): Promise<boolean> => {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return false;

        try {
            await sendEmailVerification(firebaseUser, continueToApp());
            addToast(locale.verify.resendSuccess, "success");
            return true;
        } catch (error: unknown) {
            addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
            return false;
        }
    };

    /** Re-checks verification from the server. Returns the fresh flag. */
    const checkVerification = async (): Promise<boolean> => {
        setIsLoading(true);
        try {
            const verified = await refreshUser();
            addToast(
                verified ? locale.verify.verified : locale.verify.stillWaiting,
                verified ? "success" : "info",
            );
            return verified;
        } catch (error: unknown) {
            addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // ------------------------------------------------------------------
    //  PASSWORD RESET  [A7]
    // ------------------------------------------------------------------
    const sendPasswordReset = async (email: string): Promise<void> => {
        if (!email || !EMAIL_REGEX.test(email)) {
            setErrors((prev) => ({
                ...prev,
                email: email ? locale.errors.invalidEmail : locale.errors.required,
            }));
            addToast(locale.reset.missingEmail, "error");
            return;
        }

        setIsLoading(true);
        try {
            await sendPasswordResetEmail(auth, email, continueToApp());
            addToast(locale.reset.sent, "success");
        } catch (error: unknown) {
            addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async (): Promise<void> => {
        try {
            // UserContext's listener clears the session; the guard sends us to /auth.
            await firebaseSignOut(auth);
            addToast("Logged out successfully.", "info");
        } catch (error: unknown) {
            console.error("Logout Error:", error);
            addToast(getFirebaseErrorMessage(getErrorCode(error)), "error");
        }
    };

    const toggleTab = (tab: AuthTab): void => {
        resetErrors();
        setActiveTab(tab);
    };

    return {
        signIn,
        register,
        chooseUsername,
        renameUsername,
        googleSignIn,
        sendPasswordReset,
        resendVerification,
        checkVerification,
        logout,
        isLoading,
        activeTab,
        toggleTab,
        errors,
        clearError,
        resetErrors,
    };
};
