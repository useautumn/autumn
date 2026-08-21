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
	// New React (src/react) - TanStack Query based (bundled)
	{
		entry: { index: "src/react/index.ts" },
		format: ["cjs", "esm"],
		dts: true,
		clean: false,
		outDir: "./dist/react",
		// noExternal wins for the JS bundle; the external entry only stops the
		// dts rollup from re-inlining the SDK types shipped in dist/sdk-types.
		external: ["react", "react/jsx-runtime", "react-dom", "@useautumn/sdk"],
		noExternal: [...noExternal, "@tanstack/react-query"],
		bundle: true,
		minify: true,
		keepNames: true,
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
	// SDK root + backend + better-auth in one config, so the bundled
	// @useautumn/sdk is emitted as one shared chunk per format instead of
	// one embedded copy per entry.
	{
		format: ["cjs", "esm"],
		entry: {
			"sdk/index": "./src/sdk/index.ts",
			"backend/index": "src/backend/index.ts",
			"backend/adapters/express": "src/backend/adapters/express.ts",
			"backend/adapters/fetch": "src/backend/adapters/fetch.ts",
			"backend/adapters/hono": "src/backend/adapters/hono.ts",
			"backend/adapters/next": "src/backend/adapters/next.ts",
			"better-auth/index": "src/better-auth/index.ts",
		},
		skipNodeModulesBundle: true,
		// noExternal wins for the JS bundle; the @useautumn/sdk entry only stops
		// the dts rollup from re-inlining the SDK types shipped in dist/sdk-types.
		external: [
			"react",
			"react/jsx-runtime",
			"react-dom",
			"next",
			"hono",
			"better-auth",
			"better-call",
			"@useautumn/sdk",
		],
		noExternal,
		// sdk/index declarations are hand-shimmed onto the tsc-emitted
		// dist/sdk-types tree by scripts/dedupe-dts.mjs — a rollup here would
		// re-inline the full 2 MB SDK type surface.
		dts: {
			entry: {
				"backend/index": "src/backend/index.ts",
				"backend/adapters/express": "src/backend/adapters/express.ts",
				"backend/adapters/fetch": "src/backend/adapters/fetch.ts",
				"backend/adapters/hono": "src/backend/adapters/hono.ts",
				"backend/adapters/next": "src/backend/adapters/next.ts",
				"better-auth/index": "src/better-auth/index.ts",
			},
		},
		shims: true,
		clean: false,
		outDir: "./dist",
		splitting: true,
		treeshake: true,
		minify: true,
		keepNames: true,
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
		keepNames: true,
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
