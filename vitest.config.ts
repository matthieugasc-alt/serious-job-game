import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest config — unit tests on pure mechanics.
 *
 * Scope: `app/**​/__tests__/**​/*.test.ts` and `tests/**​/*.test.ts`.
 * We deliberately do NOT set jsdom environment: every mechanic worth
 * testing here is pure TS (no DOM). React components are tested via
 * Playwright E2E (separate CI pipeline).
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: [
      "app/**/__tests__/**/*.test.ts",
      "schema/**/__tests__/**/*.test.ts",
      "scripts/**/__tests__/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    // Faster: no coverage by default. Run `npm run test:coverage` to opt in.
    coverage: {
      provider: "v8",
      include: [
        "app/lib/engine/**/*.ts",
        "app/mechanics/**/*.ts",
        "app/player/**/*.ts",
        "app/lib/founder.ts",
      ],
      exclude: ["**/*.test.ts", "**/__tests__/**", "**/node_modules/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
