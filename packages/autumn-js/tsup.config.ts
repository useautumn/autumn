import * as path from "node:path";
import type { Plugin } from "esbuild";
// @ts-expect-error - No types for esbuild-plugin-path-alias
import alias from "esbuild-plugin-path-alias";
import { defineConfig, type Options } from "tsup";

// Path aliases that match tsconfig.json
const pathAliases = {
	"@": path.resolve("./src/libraries/react"),
	"@sdk": path.resolve("./src/sdk"),
};

// The SDK ships once, as its own module tree in dist/sdk (scripts/pack-sdk.ts).
// The adapter bundles reach it through the package's `#sdk` subpath imports
// instead of inlining a copy, so a consumer loads one SDK and one AutumnError.
const sdkExternal: Plugin = {
	name: "sdk-external",
	setup(build) {
		build.onResolve({ filter: /^@useautumn\/sdk(\/.*)?$/ }, (args) => ({
			path: args.path.replace(/^@useautumn\/sdk/, "#sdk"),
			external: true,
		}));
	},
};

const reactConfigs: Options[] = [
	// New Backend (src/backend)
	{
		entry: ["src/backend/**/*.ts"],
		format: ["cjs", "esm"],
		dts: true,
		clean: false,
		outDir: "./dist/backend",
		external: ["react", "react/jsx-runtime", "react-dom", "next", "hono"],
		bundle: true,
		skipNodeModulesBundle: true,
		esbuildPlugins: [sdkExternal],
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
		bundle: true,
		skipNodeModulesBundle: true,
		esbuildPlugins: [sdkExternal],
		esbuildOptions(options) {
			options.plugins = options.plugins || [];
			options.plugins.push(alias(pathAliases));
			options.define = {
				...options.define,
			};
		},
	},

	// New React (src/react) - TanStack Query based (bundled)
	{
		entry: ["src/react/**/*.{ts,tsx}"],
		format: ["cjs", "esm"],
		dts: true,
		clean: false,
		outDir: "./dist/react",
		external: ["react", "react/jsx-runtime", "react-dom"],
		noExternal: ["@tanstack/react-query"],
		bundle: true,
		skipNodeModulesBundle: false,
		esbuildPlugins: [sdkExternal],
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

export default defineConfig(reactConfigs);
