import alias from "esbuild-plugin-path-alias";
import * as path from "path";
import { defineConfig, type Options } from "tsup";

// Path aliases that match tsconfig.json
const pathAliases = {
	"@": path.resolve("./src/libraries/react"),
	"@sdk": path.resolve("./src/sdk"),
};

const reactConfigs: Options[] = [
	// Backend
	{
		entry: ["src/libraries/backend/**/*.{ts,tsx}"],
		format: ["cjs", "esm"],
		dts: true,
		clean: false, // Don't clean on subsequent builds
		outDir: "./dist/libraries/backend",
		external: ["react", "react/jsx-runtime", "react-dom"],
		bundle: true,
		esbuildOptions(options) {
			options.plugins = options.plugins || [];
			options.plugins.push(alias(pathAliases));
		},
	},

	// React
	{
		entry: ["src/libraries/react/**/*.{ts,tsx}"],
		format: ["cjs", "esm"],
		dts: false,
		clean: false,
		outDir: "./dist/libraries/react",
		external: ["react", "react/jsx-runtime", "react-dom"],
		bundle: true,
		banner: {
			js: '"use client";',
		},
		esbuildOptions(options) {
			options.plugins = options.plugins || [];
			options.plugins.push(alias(pathAliases));
		},
	},
];

export default defineConfig([
	{
		format: ["cjs", "esm"],
		entry: ["./src/sdk/index.ts"],
		skipNodeModulesBundle: true,
		dts: false,
		shims: true,
		clean: false,
		outDir: "./dist/sdk",
		splitting: false,

		treeshake: true,
		target: "es2020",

		esbuildOptions(options) {
			options.plugins = options.plugins || [];
			options.plugins.push(alias(pathAliases));
			options.mainFields = ["module", "main"];
		},
	},

	// GLOBAL
	{
		entry: ["src/utils/*.{ts,tsx}"],
		format: ["cjs", "esm"],
		dts: false,
		clean: true,
		bundle: true,
		outDir: "./dist/utils", // Fixed wildcard path to specific directory
		external: ["react", "react/jsx-runtime", "react-dom"],
		esbuildOptions(options) {
			options.plugins = options.plugins || [];
			options.plugins.push(alias(pathAliases));
		},
	},

	...reactConfigs,
]);
