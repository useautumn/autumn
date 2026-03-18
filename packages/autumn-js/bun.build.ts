import { build, spawn } from "bun";
import * as path from "node:path";

const pkg = await Bun.file("./package.json").json();
console.time(`Building autumn-js v${pkg.version}`);

const sdkExternal = [] as string[]; // @useautumn/sdk is bundled into JS in all outputs
const reactExternal = ["react", "react/jsx-runtime", "react-dom", "@tanstack/react-query"];
const backendExternal = ["react", "react/jsx-runtime", "react-dom", "next", "hono", "express"];
const betterAuthExternal = ["better-auth", "better-call"];

async function buildEntry({
	entrypoints,
	outdir,
	external,
	banner,
	naming,
}: {
	entrypoints: string[];
	outdir: string;
	external: string[];
	banner?: string;
	naming?: string;
}) {
	for (const format of ["esm", "cjs"] as const) {
		const ext = format === "esm" ? ".mjs" : ".js";
		const result = await build({
			entrypoints,
			outdir,
			format,
			target: "node",
			external: [...external, ...sdkExternal],
			splitting: true,
			naming: naming ?? `[dir]/[name]${ext}`,
			banner: banner,
		});

		if (!result.success) {
			for (const log of result.logs) {
				console.error(log);
			}
			process.exit(1);
		}
	}
}

// SDK re-export (bundles @useautumn/sdk into JS)
await buildEntry({
	entrypoints: ["./src/sdk/index.ts"],
	outdir: "./dist/sdk",
	external: [],
});

// React bundle - bundles @useautumn/sdk and @tanstack/react-query into JS
await buildEntry({
	entrypoints: ["./src/react/index.ts"],
	outdir: "./dist/react",
	external: reactExternal,
	banner: '"use client";',
});

// Backend - main + all adapters
await buildEntry({
	entrypoints: [
		"./src/backend/index.ts",
		"./src/backend/adapters/express.ts",
		"./src/backend/adapters/hono.ts",
		"./src/backend/adapters/next.ts",
		"./src/backend/adapters/webStandard.ts",
		"./src/backend/adapters/index.ts",
	],
	outdir: "./dist/backend",
	external: backendExternal,
});

// Better-auth plugin
await buildEntry({
	entrypoints: ["./src/better-auth/index.ts"],
	outdir: "./dist/better-auth",
	external: betterAuthExternal,
});

console.timeEnd(`Building autumn-js v${pkg.version}`);

// Generate TypeScript declarations with tsc
console.time("Generating type declarations");
const tsc = spawn(["tsc", "--project", "tsconfig.build.json"], {
	stdio: ["inherit", "inherit", "inherit"],
});
const exitCode = await tsc.exited;
if (exitCode !== 0) {
	process.exit(exitCode);
}
console.timeEnd("Generating type declarations");
