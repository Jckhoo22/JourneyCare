import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase web config, read from .env as VITE_FIREBASE_*.
 * These are public web identifiers, not secrets — env is convenience, not
 * secrecy. Keep .env.example in sync when keys change.
 */
export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Fail loudly at startup rather than with a cryptic auth/invalid-api-key later.
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error(
        "Firebase config is missing. Fill in the VITE_FIREBASE_* values in .env.local using your Firebase web app settings, then restart Vite.",
    );
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * App Check debug token, for local dev only. [T22, AI2, HANDOFF § 1]
 *
 * Firebase AI Logic auto-enforces App Check on every model call. In
 * production the reCAPTCHA v3 provider (set up in the Firebase console
 * during the AI Logic guided flow) mints tokens. In local dev the
 * debug provider stands in — it's a UUID Shirley generates in the
 * console and pastes into `.env.local`.
 *
 * Reading it here (not inside `aiClient.ts`) so it's set BEFORE any
 * App Check enforcement happens on any Firebase service, per SDK
 * requirements.
 */
if (
    typeof window !== "undefined" &&
    import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN
) {
    (
        window as Window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env
        .VITE_APP_CHECK_DEBUG_TOKEN;
}

export { app, auth, db };

// Support Google Sign In
export const googleAuthProvider = new GoogleAuthProvider();
