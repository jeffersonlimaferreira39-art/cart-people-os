import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20000,
  },
});
