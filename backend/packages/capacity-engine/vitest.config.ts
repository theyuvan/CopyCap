import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@mirrorcap/shared-types": path.resolve(__dirname, "../shared-types/src/index.ts"),
    },
  },
});
