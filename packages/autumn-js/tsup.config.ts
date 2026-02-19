import * as path from "node:path";
// @ts-expect-error - No types for esbuild-plugin-path-alias
import alias from "esbuild-plugin-path-alias";
import { defineConfig, type Options } from "tsup";

// Path aliases that match tsconfig.json
const pathAliases = {
	"@": path.resolve("./src/libraries/react"),
	"@sdk": path.resolve("./src/sdk"),
	"@useautumn/sdk": path.resolve("../sdk/src"),
};

// Packages to bundle (not external) - workspace packages that should be inlined
const noExternal = ["@useautumn/sdk"];

const reactConfigs: Options[] = [
	// New Backend (src/backend)
	{
		entry: ["src/backend/**/*.ts"],
		format: ["cjs", "esm"],
		dts: true,
		clean: false,
		outDir: "./dist/backend",
		external: ["react", "react/jsx-runtime", "react-dom", "next", "hono"],
		noExternal,
		bundle: true,
		skipNodeModulesBundle: true,
		esbuildOptions(options) {
			options.plugins = options.plugins || [];
			options.plugins.push(alias(pathAliases));
			options.define = {
				...options.define,
			};
		},
	},

	// Better Auth Plugin (src/better-auth)
	{
		entry: ["src/better-auth/**/*.ts"],
		format: ["cjs", "esm"],
		dts: true,
		clean: false,
		outDir: "./dist/better-auth",
		external: ["better-auth", "better-call"],
		noExternal,
		bundle: true,
		skipNodeModulesBundle: true,
		esbuildOptions(options) {
			options.plugins = options.plugins || [];
			options.plugins.push(alias(pathAliases));
			options.define = {
				...options.define,
			};
		},
	},

	// New React (src/react) - TanStack Query based
	{
		entry: ["src/react/**/*.{ts,tsx}"],
		format: ["cjs", "esm"],
		dts: true,
		clean: false,
		outDir: "./dist/react",
		external: [
			"react",
			"react/jsx-runtime",
			"react-dom",
			"@tanstack/react-query",
		],
		noExternal,
		bundle: true,
		skipNodeModulesBundle: true,
		banner: {
			js: '"use client";',
		},
		esbuildOptions(options) {
			options.plugins = options.plugins || [];
			options.plugins.push(alias(pathAliases));
			options.define = {
				...options.define,
				__dirname: "import.meta.dirname",
				__filename: "import.meta.filename",
			};
		},
	},
];

export default defineConfig([
	// Main SDK entry point (re-exports @useautumn/sdk)
	{
		format: ["cjs", "esm"],
		entry: ["./src/sdk/index.ts"],
		skipNodeModulesBundle: true,
		noExternal,
		dts: true,
		shims: true,
		clean: false,
		outDir: "./dist/sdk",
		splitting: false,
		treeshake: true,
		target: "es2020",
		esbuildOptions(options) {
			options.plugins = options.plugins || [];
			options.plugins.push(alias(pathAliases));
			options.define = {
				...options.define,
				__dirname: "import.meta.dirname",
				__filename: "import.meta.filename",
			};
			options.mainFields = ["module", "main"];
		},
	},

	...reactConfigs,
]);
