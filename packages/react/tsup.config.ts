import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      "server/index": "src/server/index.ts", // Changed from "server" to "server/index"
    },
    dts: true,
    clean: true,
  },
  {
    entry: {
      index: "src/index.ts",
    },
    dts: true,
    clean: true,
    banner: {
      js: "'use client'",
    },
  },
]);
