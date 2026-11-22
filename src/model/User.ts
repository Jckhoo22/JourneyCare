import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * The in-memory session model. Hydrated from the Firebase Auth user by
 * UserContext, then enriched with the Firestore profile (username) once loaded.
 */
export interface UserProfile {
    /** The unique ID from Firebase Auth */
    uid: string;
    /** User's email address */
    email: string;
    /** Chosen at sign-up, or derived from the provider display name */
    username: string;
    /** Display name reported by the auth provider */
    nickname: string;
    /** Provider avatar, if any */
    photoURL: string;
    /** Date of Birth (ISO String) */
    dob: string;
    /** Preference: 'en', 'ms', 'zh'. Stored on users/{uid}.language. [I18N2] */
    language: string;
    isFirstTimeLogin: boolean;
    /** 'USER' or 'ADMIN' */
    role: "USER" | "ADMIN";
    /** Firebase Auth's verification flag */
    emailVerified: boolean;
    /**
     * True when the account signs in with email/password. Social accounts are
     * verified by their provider, so only password accounts hit the gate. [A5]
     */
    isPasswordUser: boolean;
    /**
     * How many groups this user owns. [P3b]
     *
     * Carried in the session so the home screen can compare it against the
     * groups it already has loaded and repair it without spending a read. See
     * useSyncGroupsOwned in GroupsController.
     */
    groupsOwned: number;
}

export const DEFAULT_USER: UserProfile = {
    uid: "",
    email: "",
    username: "",
    nickname: "",
    photoURL: "",
    dob: "",
    language: "en",
    isFirstTimeLogin: false,
    role: "USER",
    emailVerified: false,
    isPasswordUser: false,
    groupsOwned: 0,
};

/**
 * Shape of the `users/{uid}` Firestore document. [A6]
 * Written on sign-up and on first social sign-in; readable and writable only by
 * that uid — see firestore.rules § users. [S3]
 */
export interface UserDoc {
    username: string;
    email: string;
    /** serverTimestamp() on write; a Timestamp when read back */
    createdAt: Timestamp | FieldValue;
    /**
     * Groups owned. [P3b] Optional: profiles created before T9 have none, and
     * everything treats its absence as zero rather than demanding a migration.
     */
    groupsOwned?: number;
    /**
     * UI language preference. [T19, I18N1, I18N2]
     *
     * Optional: absent means the app uses the local cache, which itself
     * defaults to English. Written by the Settings language selector.
     */
    language?: "en" | "ms" | "zh";
}
