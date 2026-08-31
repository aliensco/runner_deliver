import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/server/**/*.test.ts"],
    clearMocks: true,
    pool: "forks",
    fileParallelism: false
  }
});
