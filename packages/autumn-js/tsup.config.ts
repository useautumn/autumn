import * as fs from "node:fs";
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

const sdkSrcDir = path.resolve("../sdk/src");
const standaloneOutDir = "./dist/standalone";

// One entry per generated standalone function, so importing a single operation
// never evaluates the other operations' Zod schemas.
const standaloneEntry: Record<string, string> = {
	core: path.join(sdkSrcDir, "core.ts"),
};
for (const file of fs.readdirSync(path.join(sdkSrcDir, "funcs"))) {
	if (!file.endsWith(".ts")) continue;
	standaloneEntry[`funcs/${file.slice(0, -3)}`] = path.join(
		sdkSrcDir,
		"funcs",
		file,
	);
}

const reactConfigs: Options[] = [
	// New Backend (src/backend)
	{
		entry: {
			index: "src/backend/index.ts",
			"adapters/express": "src/backend/adapters/express.ts",
			"adapters/fetch": "src/backend/adapters/fetch.ts",
			"adapters/hono": "src/backend/adapters/hono.ts",
			"adapters/next": "src/backend/adapters/next.ts",
		},
		format: ["cjs", "esm"],
		dts: true,
		clean: false,
		outDir: "./dist/backend",
		external: ["react", "react/jsx-runtime", "react-dom", "next", "hono"],
		noExternal,
		bundle: true,
		splitting: true,
		treeshake: true,
		minify: true,
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
		entry: { index: "src/better-auth/index.ts" },
		format: ["cjs", "esm"],
		dts: true,
		clean: false,
		outDir: "./dist/better-auth",
		external: ["better-auth", "better-call"],
		noExternal,
		bundle: true,
		splitting: true,
		treeshake: true,
		minify: true,
		skipNodeModulesBundle: true,
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
		entry: { index: "src/react/index.ts" },
		format: ["cjs", "esm"],
		dts: true,
		clean: false,
		outDir: "./dist/react",
		external: ["react", "react/jsx-runtime", "react-dom"],
		noExternal: [...noExternal, "@tanstack/react-query"],
		bundle: true,
		minify: true,
		skipNodeModulesBundle: false,
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
		minify: true,
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

	// Standalone per-operation functions (ESM only, code-split so shared runtime
	// is emitted once instead of once per operation).
	{
		entry: standaloneEntry,
		format: ["esm"],
		outDir: standaloneOutDir,
		outExtension: () => ({ js: ".js" }),
		dts: false,
		clean: false,
		bundle: true,
		splitting: true,
		treeshake: true,
		minify: true,
		skipNodeModulesBundle: true,
		target: "es2020",
		onSuccess: async () => {
			fs.writeFileSync(
				path.join(standaloneOutDir, "package.json"),
				`${JSON.stringify({ type: "module", sideEffects: false }, null, 2)}\n`,
			);
		},
	},
]);
