import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "sdk/index": "src/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
});
