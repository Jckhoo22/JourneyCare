export const ROUTES = {
    home: "/",
    auth: "/auth",
    verifyEmail: "/verify-email",
    /** One-time display-name screen on first entry. [A6] */
    chooseUsername: "/choose-username",
    /** Notification list. [N4] */
    notifications: "/notifications",
    /** Profile, email, sign out, about. [SET1, SET2] */
    settings: "/settings",
    /**
     * A group's home — the CARS space. Phase 2 fills it; Phase 1 shows the
     * group's name, a one-line summary and a placeholder. [G2]
     */
    groupDetail: "/groups/:groupId",
    /** Members + pending requests + delete/leave. [G6, G7, G9, G10, G11] */
    groupMembers: "/groups/:groupId/members",
    /** Owner + edit-holder admin index: rename, review requests, invite, fix
        totals. Reached from the "Manage group" link on GroupDetail. [UX 2d] */
    groupManage: "/groups/:groupId/manage",
    /** QR, link and code. Owner-only. [G3, G4] */
    groupInvite: "/groups/:groupId/invite",
    /** Add a car to a group. Owner or a canAddCars member. [C1–C3] */
    addCar: "/groups/:groupId/cars/new",
    /** A car's own page: photo, details, odometer. [C5, C8, C9, C10] */
    carDetail: "/groups/:groupId/cars/:carId",
    carMaintenance: "/groups/:groupId/cars/:carId/maintenance",
    /** Editing a car's identity. carEdit holders. [C8] */
    editCar: "/groups/:groupId/cars/:carId/edit",
    /** Logging a service. carEdit holders. [L1] */
    addLog: "/groups/:groupId/cars/:carId/logs/new",
    /** Editing one. [L5] */
    editLog: "/groups/:groupId/cars/:carId/logs/:logId/edit",
    /** Logging a workshop visit — many items in one batched write. [T17, V1] */
    addVisit: "/groups/:groupId/cars/:carId/visits/new",
    /** Create-group flow — placeholder until T4 [G1]. */
    createGroup: "/groups/new",
    /** Join-with-a-code flow — placeholder until T5 [G3]. */
    joinWithCode: "/groups/join",
    /** Group invite deep link — the real screen lands in T5. */
    join: "/join/:groupId/:token",
} as const;

/**
 * Route to a group's cars space. [H4]
 *
 * Still the bare `/groups/{id}` it has always been, so every invite link,
 * notification target and bookmark minted before the group screen was split
 * into three keeps working — it lands on the cars space, which is now the
 * group's front door.
 */
export const groupPath = (groupId: string): string => `/groups/${groupId}`;

/** Route to a group's members screen. */
export const groupMembersPath = (groupId: string): string =>
    `/groups/${groupId}/members`;

/** Route to a group's admin index. [UX 2d] */
export const groupManagePath = (groupId: string): string =>
    `/groups/${groupId}/manage`;

/** Route to a group's invitation screen. Owner-only once there. */
export const groupInvitePath = (groupId: string): string =>
    `/groups/${groupId}/invite`;

/**
 * Route to the add-car form for a group. [C1]
 *
 * Declared before `carDetail` in ROUTES, and matched ahead of it by react
 * router's static-beats-dynamic ranking — `/groups/x/cars/new` is the add form,
 * never a car whose id happens to be "new".
 */
export const addCarPath = (groupId: string): string =>
    `/groups/${groupId}/cars/new`;

/** Route to a car's own page. [C10] */
export const carPath = (groupId: string, carId: string): string =>
    `/groups/${groupId}/cars/${carId}`;

export const carMaintenancePath = (groupId: string, carId: string): string =>
    `${carPath(groupId, carId)}/maintenance`;

/** Route to a car's edit form. [C8] */
export const editCarPath = (groupId: string, carId: string): string =>
    `/groups/${groupId}/cars/${carId}/edit`;

/** Route to the log-a-service form. [L1] */
export const addLogPath = (groupId: string, carId: string): string =>
    `/groups/${groupId}/cars/${carId}/logs/new`;

/** Route to the multi-item visit form. [T17, V1] */
export const addVisitPath = (groupId: string, carId: string): string =>
    `/groups/${groupId}/cars/${carId}/visits/new`;

/** Route to one entry's edit form. [L5] */
export const editLogPath = (
    groupId: string,
    carId: string,
    logId: string,
): string => `/groups/${groupId}/cars/${carId}/logs/${logId}/edit`;

/** Builds the URL a group's QR code and copyable invite link both encode. */
export const joinPath = (groupId: string, token: string): string =>
    `/join/${groupId}/${token}`;

/**
 * Where to send the user once they finish signing in.
 *
 * Carried in the URL rather than memory or storage: it survives a page reload,
 * survives the Google redirect fallback bouncing through accounts.google.com,
 * and keeps the route guards free of render-phase side effects. [A5]
 */
const NEXT_PARAM = "next";

const withNext = (base: string, next: string | null): string =>
    next ? `${base}?${NEXT_PARAM}=${encodeURIComponent(next)}` : base;

/** The auth URL that returns to `path` once signed in. */
export const authPathWithNext = (path: string | null): string =>
    withNext(ROUTES.auth, path);

/** The gate URL that keeps a pending destination alive across verification. */
export const verifyPathWithNext = (next: string | null): string =>
    withNext(ROUTES.verifyEmail, next);

/** The username screen, likewise preserving where the user was headed. [A6] */
export const usernamePathWithNext = (next: string | null): string =>
    withNext(ROUTES.chooseUsername, next);

/**
 * Reads ?next=, rejecting anything that isn't a same-site absolute path so a
 * crafted link can't bounce a signed-in user off to another origin.
 */
export const readNext = (search: string): string | null => {
    const raw = new URLSearchParams(search).get(NEXT_PARAM);
    if (!raw) return null;
    // "//evil.com" and "https://evil.com" are both absolute URLs to a browser.
    if (!raw.startsWith("/") || raw.startsWith("//")) return null;
    return raw;
};
