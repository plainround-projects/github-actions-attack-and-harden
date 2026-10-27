import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The end-to-end test starts a Node process; on a busy laptop or a shared runner that can take longer than 5 s.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "pipeline/**/*.ts"],
      exclude: ["src/main.ts", "pipeline/*-cli.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 },
    },
  },
});
