import { defineConfig } from "vitest/config";

/**
 * Firestore security-rules tests run in Node against the emulator, not jsdom.
 * Launched via `npm run test:rules`, which wraps this in `firebase emulators:exec`.
 */
export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        include: ["tests/rules/**/*.test.ts"],
        testTimeout: 20000,
        hookTimeout: 20000,
        fileParallelism: false,
    },
});
