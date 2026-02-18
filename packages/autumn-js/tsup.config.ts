import * as path from "node:path";
// @ts-expect-error - No types for esbuild-plugin-path-alias
import alias from "esbuild-plugin-path-alias";
import { defineConfig, type Options } from "tsup";

// Path aliases that match tsconfig.json
const pathAliases = {
	"@": path.resolve("./src/libraries/react"),
	"@sdk": path.resolve("./src/sdk"),
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

	// Legacy React (src/libraries/react) - SWR based (deprecated)
	{
		entry: ["src/libraries/react/**/*.{ts,tsx}"],
		format: ["cjs", "esm"],
		dts: true,
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
			options.define = {
				...options.define,
				__dirname: "import.meta.dirname",
				__filename: "import.meta.filename",
			};
		},
	},
];

export default defineConfig([
	{
		format: ["cjs", "esm"],
		entry: ["./src/sdk/index.ts"],
		skipNodeModulesBundle: true,
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

	// GLOBAL
	{
		entry: ["src/utils/*.{ts,tsx}"],
		format: ["cjs", "esm"],
		dts: true,
		clean: true,
		bundle: true,
		outDir: "./dist/utils", // Fixed wildcard path to specific directory
		external: ["react", "react/jsx-runtime", "react-dom"],
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

	// SDK
	// {
	//   entry: ["src/next/*.{ts,tsx}"],
	//   format: ["cjs", "esm"],
	//   dts: true,
	//   clean: false, // Don't clean on subsequent builds
	//   outDir: "./dist/next",
	//   external: ["react", "react/jsx-runtime", "react-dom"],
	//   bundle: false,
	//   esbuildOptions(options) {
	//     options.plugins = options.plugins || [];
	//     options.plugins.push(alias(pathAliases));
	//     options.define = {
	//       ...options.define,
	//       __dirname: "import.meta.dirname",
	//       __filename: "import.meta.filename",
	//     };
	//   },
	// },
	...reactConfigs,
]);
