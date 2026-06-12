import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		"ai-sdk/index": "src/ai-sdk/index.ts",
		"openrouter/index": "src/openrouter/index.ts",
	},
	format: ["cjs", "esm"],
	dts: true,
	splitting: false,
	sourcemap: false,
	clean: true,
});
