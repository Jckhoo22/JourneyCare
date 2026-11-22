/**
 * Maps Firebase Auth error codes to copy we're happy to show a user.
 * Unknown codes fall back to a generic message and log the raw code.
 */
export const getFirebaseErrorMessage = (errorCode: string | undefined): string => {
    switch (errorCode) {
        // --- Registration Errors ---
        case 'auth/email-already-in-use': // (Client SDK version of auth/email-already-exists)
            return "This email is already registered. Please try logging in instead.";

        case 'auth/weak-password':
            // Matches PASSWORD_REGEX: 8+ characters with at least one number.
            return "Password is too weak. Use at least 8 characters including a number.";

        case 'auth/invalid-email':
            return "The email address is invalid.";

        // --- Login Errors ---
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            // Security Best Practice: Don't tell hackers if the email or password was the problem.
            return "Invalid email or password.";

        case 'auth/user-disabled':
            return "This account has been disabled by an administrator.";

        // --- Account Lockout (Security) ---
        case 'auth/too-many-requests':
            return "Access to this account has been temporarily disabled due to too many failed login attempts. Please try again later or reset your password.";

        // --- Google / Popup Errors ---
        case 'auth/popup-closed-by-user':
            return "Sign-in was cancelled.";

        case 'auth/popup-blocked':
            return "The sign-in popup was blocked by your browser. Please allow popups for this site.";

        case 'auth/cancelled-popup-request':
            return "Only one popup request is allowed at one time.";

        case 'auth/account-exists-with-different-credential':
            return "An account already exists with this email. Sign in using your original method.";

        case 'auth/unauthorized-domain':
            return "This domain isn't authorised for sign-in. Add it in the Firebase console.";

        // --- Password reset ---
        case 'auth/missing-email':
            return "Enter your email address first.";

        // --- Firestore (profile reads/writes) ---
        case 'permission-denied':
            return "You don't have permission to do that.";

        case 'unavailable':
            return "Can't reach the database right now. Check your connection and try again.";

        // --- System / Network Errors ---
        case 'auth/network-request-failed':
            return "Network error. Please check your internet connection.";

        case 'auth/internal-error':
            return "An unexpected server error occurred. Please try again.";

        // --- Fallback ---
        default:
            // Log the raw code to console so you (the dev) can see it
            console.warn("Unhandled Firebase Error:", errorCode);
            return "An error occurred. Please try again.";
    }
};

/** Narrows an unknown catch value to something with a Firebase error code. */
export const getErrorCode = (error: unknown): string | undefined =>
    typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
