import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Component/unit tests: jsdom + Testing Library (replaces CRA's Jest).
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: "jsdom",
            globals: true,
            setupFiles: ["./src/setupTests.ts"],
            include: ["src/**/*.{test,spec}.{ts,tsx}"],
        },
    }),
);
