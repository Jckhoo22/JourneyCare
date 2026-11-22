import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist", "node_modules", "build"] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": [
                "warn",
                { allowConstantExport: true },
            ],
            // A leading underscore marks a parameter that exists only to give a
            // signature its shape — common in test doubles.
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
        },
    },
    {
        // Config files and rules tests run in Node, not the browser.
        files: ["*.config.{js,ts}", "tests/**/*.ts"],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        // Providers and their hooks live in one file by convention here, which
        // costs fast-refresh granularity in dev and nothing in production.
        files: ["src/context/**/*.tsx"],
        rules: {
            "react-refresh/only-export-components": "off",
        },
    },
);
