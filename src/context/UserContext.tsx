import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";

import { auth } from "../configurations/firebase-config";
import { loadProfile } from "../controller/userProfile";
import { DEFAULT_USER, type UserProfile } from "../model/User";

interface UserContextValue {
    user: UserProfile | null;
    /** True until Firebase has restored (or ruled out) a session. */
    isAuthLoading: boolean;
    /**
     * Re-reads the Firebase user from the server. Used by the verify-email
     * gate's "I've verified" button. Resolves to the fresh emailVerified flag.
     */
    refreshUser: () => Promise<boolean>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

/**
 * Maps a Firebase Auth user onto our session model, enriching it with the
 * Firestore profile when one exists.
 */
const toUserProfile = async (firebaseUser: FirebaseUser): Promise<UserProfile> => {
    const isPasswordUser = firebaseUser.providerData.some(
        (provider) => provider.providerId === "password",
    );

    // Username comes from Firestore and nowhere else. It is deliberately NOT
    // defaulted to displayName: under A6 an empty username is the signal that
    // sends the user to the one-time username screen, and a social display name
    // filling it in would silently skip that screen.
    let username = "";
    let groupsOwned = 0;
    let language: string = DEFAULT_USER.language;
    try {
        const stored = await loadProfile(firebaseUser);
        username = stored.username ?? "";
        groupsOwned = stored.groupsOwned;
        if (stored.language) language = stored.language;
    } catch (error) {
        // Treat an unreadable profile as "no username yet". The username screen
        // will surface the real error if the write fails too.
        console.warn("Could not load user profile:", error);
    }

    return {
        ...DEFAULT_USER,
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? "",
        username,
        groupsOwned,
        language,
        nickname: firebaseUser.displayName ?? "",
        photoURL: firebaseUser.photoURL ?? "",
        emailVerified: firebaseUser.emailVerified,
        isPasswordUser,
    };
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    // The single source of truth for session state. Everything else in the app
    // (the controller included) reads from here rather than adding a listener.
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser ? await toUserProfile(firebaseUser) : null);
            setIsAuthLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const refreshUser = useCallback(async () => {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return false;

        await firebaseUser.reload();
        // reload() mutates the instance in place instead of emitting an auth
        // event, so re-map it by hand.
        setUser(await toUserProfile(firebaseUser));
        return firebaseUser.emailVerified;
    }, []);

    return (
        <UserContext.Provider value={{ user, isAuthLoading, refreshUser }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = (): UserContextValue => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
};
