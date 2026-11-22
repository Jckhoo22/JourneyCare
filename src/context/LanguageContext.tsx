import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useUser } from "./UserContext";
import { auth } from "../configurations/firebase-config";
import { saveLanguage } from "../controller/userProfile";

import { strings as en, type Locale } from "../locale/English";
import { strings as ms } from "../locale/Malay";
import { strings as zh } from "../locale/Chinese";
import { mergeLocale } from "../locale/merge";

/**
 * The supported language codes. [I18N1]
 *
 * Three languages, ISO codes: English (default), Bahasa Melayu, Chinese
 * Simplified. Anything else falls back to English. Adding a language means
 * a new `.ts` under `locale/`, a new entry here, and a new option in
 * Settings — no changes to the merge machinery.
 *
 * ── All three dictionaries are STATICALLY IMPORTED ─────────────────────
 * A language switch is a pointer swap in memory, not a network request.
 * The bundler pulls all three into the main bundle at build time so
 * switching is O(µs) — no `import()`, no fetch, no waterfall. Verified
 * by inspecting the network tab during a language change: zero requests
 * fire (the deferred payload is what would show up otherwise). Total
 * added weight is ≈ 30KB gzip for two languages against a 300KB app —
 * cheap for the "language switch feels instant" property that pays it.
 */
export const SUPPORTED_LANGUAGES = ["en", "ms", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const isSupportedLanguage = (
    value: string | undefined | null,
): value is SupportedLanguage =>
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

/** Local cache key so pre-auth screens can render in the last-used language. */
const LOCAL_LANGUAGE_KEY = "journeycare.language";

const readCachedLanguage = (): SupportedLanguage | undefined => {
    if (typeof window === "undefined") return undefined;
    try {
        const cached = window.localStorage.getItem(LOCAL_LANGUAGE_KEY);
        return isSupportedLanguage(cached) ? cached : undefined;
    } catch {
        return undefined;
    }
};

const writeCachedLanguage = (language: SupportedLanguage) => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(LOCAL_LANGUAGE_KEY, language);
    } catch {
        /* localStorage disabled — fall back to session-only. */
    }
};

/**
 * Maps `navigator.language` onto one of our supported codes. [Boot flow #3]
 *
 * The BCP-47 primary subtag is what we care about — a "zh-TW" reader
 * gets Simplified Chinese because we ship one Chinese dictionary
 * (Traditional is deferred, per POLISH § 0). "en-*" and "ms-*" fold
 * onto the base codes exactly.
 *
 * Returns `undefined` when nothing recognisable is found — the caller
 * then falls back to English.
 */
const languageFromNavigator = (): SupportedLanguage | undefined => {
    if (typeof navigator === "undefined") return undefined;
    const raw = navigator.language ?? navigator.languages?.[0];
    if (!raw) return undefined;
    const primary = raw.toLowerCase().split(/[-_]/)[0];
    if (isSupportedLanguage(primary)) return primary;
    return undefined;
};

/**
 * The full boot-time resolution order. [Boot flow spec #3]
 *
 *   1. localStorage — a returning user gets what they last picked
 *      (survives sign-out and a fresh browser session, so the login
 *      screen speaks their language before the profile loads).
 *   2. navigator.language — a first-time visitor gets the OS locale
 *      if it matches one of ours.
 *   3. English default.
 *
 * The user's Firestore profile reconciles ON TOP of this once loaded —
 * see the reconcile effect in the provider. That reconcile happens
 * exactly ONCE per uid so a subsequent in-app language change is not
 * fought by the profile echo.
 */
const resolveInitialLanguage = (): SupportedLanguage =>
    readCachedLanguage() ?? languageFromNavigator() ?? "en";

interface LanguageContextValue {
    /** Fully-resolved locale, English + partial overrides deep-merged. */
    locale: Locale;
    /** Currently active language code. */
    language: SupportedLanguage;
    /**
     * Set the active language. [Language change spec #2]
     *
     *   a) updates the context synchronously (instant re-render),
     *   b) writes to localStorage,
     *   c) fire-and-forget writes to `users/{uid}.language` — the
     *      caller is not awaiting, and the UI is not driven off the
     *      onSnapshot echo. If the write fails the local state stands
     *      and next boot the localStorage cache keeps the choice.
     */
    setLanguage: (language: SupportedLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
    undefined,
);

/**
 * Picks the dictionary for a language preference. Anything unrecognised
 * falls back to English via the type guard. [I18N2]
 */
const localeFor = (language: SupportedLanguage): Locale => {
    switch (language) {
        case "ms":
            return mergeLocale(en, ms);
        case "zh":
            return mergeLocale(en, zh);
        case "en":
        default:
            return en;
    }
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
    // Language is a plain state, NOT derived from the user profile. That
    // decoupling is what makes a language change feel instant: the user's
    // Firestore language field is a persisted preference we reconcile
    // with, not a live control that drives every render. Previous
    // implementation used `profileLanguage ?? localLanguage`, and any
    // change had to wait for the Firestore round-trip before the UI
    // flipped — which felt bad on 3G. This version writes local first
    // and persists in the background.
    const [language, setLanguageState] = useState<SupportedLanguage>(() =>
        resolveInitialLanguage(),
    );
    const { user } = useUser();

    /**
     * The profile reconcile runs ONCE per uid. [Boot flow #3]
     *
     * When the user signs in and the profile loads, `user.language` may
     * disagree with our current state (a login on a different device
     * that later saved a different preference, or a first-time load
     * where the profile has "en" and we started from OS locale).
     *
     * We prefer the profile value in that case — it's the "true" account
     * preference. We do NOT keep pushing it: after this one reconcile,
     * `user.language` changes (e.g. from a saveLanguage echo we just
     * triggered ourselves) do not overwrite the state. Otherwise the
     * setLanguage → Firestore write → onSnapshot cycle would fight
     * whatever the user just picked.
     */
    const lastReconciledUid = useRef<string | null>(null);
    useEffect(() => {
        if (!user?.uid) {
            // Signed out — reset so a re-signin reconciles again.
            lastReconciledUid.current = null;
            return;
        }
        if (lastReconciledUid.current === user.uid) return;
        lastReconciledUid.current = user.uid;

        const profileLanguage = isSupportedLanguage(user.language)
            ? user.language
            : undefined;

        if (profileLanguage && profileLanguage !== language) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLanguageState(profileLanguage);
            writeCachedLanguage(profileLanguage);
        }
        // Deliberately runs on uid change only. The state we set here
        // must not restart the effect, and later profile-language
        // changes (echo of our own writes) must NOT reset it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    const setLanguage = useCallback((next: SupportedLanguage) => {
        // a) instant apply
        setLanguageState(next);
        // b) localStorage
        writeCachedLanguage(next);
        // c) fire-and-forget Firestore write. The caller doesn't await
        //    and the UI does not read this back — the local state has
        //    already been applied. A failure just means next-device
        //    doesn't see this preference; the CURRENT device is fine.
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
            void saveLanguage(firebaseUser, next).catch((error) => {
                console.warn("Language write failed:", error);
            });
        }
    }, []);

    const locale = useMemo(() => localeFor(language), [language]);
    const value = useMemo(
        () => ({ locale, language, setLanguage }),
        [locale, language, setLanguage],
    );

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = (): LanguageContextValue => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
};
