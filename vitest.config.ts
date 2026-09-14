import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/server/**/*.test.ts", "src/client/**/*.test.ts"],
    clearMocks: true,
    pool: "forks",
    fileParallelism: false
  }
});
