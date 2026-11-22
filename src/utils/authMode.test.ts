import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { config } = vi.hoisted(() => ({
    config: { authDomain: "" } as { authDomain: string },
}));

vi.mock("../configurations/firebase-config", () => ({
    auth: { currentUser: null },
    db: {},
    googleAuthProvider: {},
    firebaseConfig: config,
}));

import {
    isAuthHandlerSameOrigin,
    isMobileClient,
    preferredGoogleSignInMode,
} from "./authMode";

/** jsdom has no real matchMedia; drive it from the queries under test. */
const setViewport = ({
    narrow,
    coarse,
}: {
    narrow: boolean;
    coarse: boolean;
}) => {
    vi.stubGlobal(
        "matchMedia",
        (queryText: string) => ({
            matches: queryText.includes("pointer: coarse") ? coarse : narrow,
            media: queryText,
        }),
    );
};

const setHost = (host: string) => {
    // jsdom's location is read-only; replace the property outright.
    Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, host },
    });
};

describe("authMode [A5, Item 1]", () => {
    beforeEach(() => {
        config.authDomain = "";
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe("isMobileClient", () => {
        it("is true on a narrow viewport", () => {
            setViewport({ narrow: true, coarse: false });
            expect(isMobileClient()).toBe(true);
        });

        it("is true on a touch device that isn't narrow — a tablet", () => {
            setViewport({ narrow: false, coarse: true });
            expect(isMobileClient()).toBe(true);
        });

        it("is false on a wide mouse-driven viewport", () => {
            setViewport({ narrow: false, coarse: false });
            expect(isMobileClient()).toBe(false);
        });
    });

    describe("isAuthHandlerSameOrigin", () => {
        it("is true when authDomain IS the app's host", () => {
            config.authDomain = "car-log-project.web.app";
            setHost("car-log-project.web.app");
            expect(isAuthHandlerSameOrigin()).toBe(true);
        });

        /**
         * The configuration this project actually ships today. These two hosts
         * share a project name and nothing a browser cares about — the handler
         * is third-party, its storage gets blocked, and a redirect sign-in
         * silently fails to complete.
         */
        it("is FALSE for web.app vs firebaseapp.com", () => {
            config.authDomain = "car-log-project.firebaseapp.com";
            setHost("car-log-project.web.app");
            expect(isAuthHandlerSameOrigin()).toBe(false);
        });

        it("is false on localhost, where authDomain is remote", () => {
            config.authDomain = "car-log-project.firebaseapp.com";
            setHost("localhost:5173");
            expect(isAuthHandlerSameOrigin()).toBe(false);
        });

        it("is false when authDomain isn't configured at all", () => {
            config.authDomain = "";
            setHost("car-log-project.web.app");
            expect(isAuthHandlerSameOrigin()).toBe(false);
        });
    });

    describe("preferredGoogleSignInMode", () => {
        it("uses redirect on a phone once the handler is same-origin", () => {
            config.authDomain = "car-log-project.web.app";
            setHost("car-log-project.web.app");
            setViewport({ narrow: true, coarse: true });

            expect(preferredGoogleSignInMode()).toBe("redirect");
        });

        /**
         * The guard that matters. A phone with a cross-origin auth handler must
         * NOT be sent down the redirect path: it would authenticate with Google
         * and come back signed out, with no error to show for it.
         */
        it("keeps a phone on the popup while the handler is cross-origin", () => {
            config.authDomain = "car-log-project.firebaseapp.com";
            setHost("car-log-project.web.app");
            setViewport({ narrow: true, coarse: true });

            expect(preferredGoogleSignInMode()).toBe("popup");
        });

        it("uses the popup on desktop even when redirect would work", () => {
            config.authDomain = "car-log-project.web.app";
            setHost("car-log-project.web.app");
            setViewport({ narrow: false, coarse: false });

            expect(preferredGoogleSignInMode()).toBe("popup");
        });
    });
});
