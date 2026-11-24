import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    test: {
        environment: "jsdom",
        include: ["src/**/*.test.{ts,tsx}"],
        setupFiles: ["./src/test/setup.ts"],
        // The editor page tests render the whole page in jsdom (1-2 s each alone); in a full
        // parallel run on a busy machine they can pass the 5 s default.
        testTimeout: 15_000,
    },
});
