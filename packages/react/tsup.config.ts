import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    dts: true,
    clean: false,
    banner: {
      js: "'use client'",
    },
  },
  {
    entry: {
      "server/index": "src/server/index.ts", // Changed from "server" to "server/index"
    },
    dts: true,
    clean: true,
    outDir: "dist",
  },
]);
