import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
	additionalPackages,
	aptGet,
	syncEnvVars,
} from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk/v3";
import { fetchInfisicalSecretsFromEnv } from "./server/src/external/infisical/fetchInfisicalSecrets.js";

// Bun requires every configured workspace to contain a package.json, even
// though Trigger bundles workspace code and only installs external packages.
const rootPackageJson = JSON.parse(readFileSync("package.json", "utf-8")) as {
	workspaces: string[] | { packages: string[] };
};

const workspacePatterns = Array.isArray(rootPackageJson.workspaces)
	? rootPackageJson.workspaces
	: rootPackageJson.workspaces.packages;

const expandWorkspacePattern = (pattern: string): string[] => {
	if (!pattern.includes("*")) {
		return [pattern];
	}
	const baseDir = pattern.slice(0, pattern.indexOf("*")).replace(/\/$/, "");
	return readdirSync(baseDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => `${baseDir}/${entry.name}`);
};

const workspacePackageDirs = workspacePatterns
	.flatMap(expandWorkspacePattern)
	.filter((dir) => existsSync(`${dir}/package.json`))
	.sort();

const workspacePackageStubs = workspacePackageDirs.map((dir) => {
	const packageJson = JSON.parse(
		readFileSync(`${dir}/package.json`, "utf-8"),
	) as { name?: string };
	if (!packageJson.name) {
		throw new Error(`Workspace package ${dir} is missing a name`);
	}

	return {
		dir,
		contents: JSON.stringify({ name: packageJson.name, private: true }),
	};
});

export default defineConfig({
	project: "proj_cwiutfmpdzfcshxevkok",
	runtime: "bun",
	logLevel: "log",
	maxDuration: 3600,
	retries: {
		enabledInDev: true,
		default: {
			maxAttempts: 3,
			minTimeoutInMs: 1000,
			maxTimeoutInMs: 10000,
			factor: 2,
			randomize: true,
		},
	},
	dirs: [
		"server/src/trigger",
		"server/src/internal/billing/v2/actions/batchTransition/tasks",
	],
	build: {
		// Native / heavy deps stay external — bundling them inflates the deploy
		// and breaks platform-specific binaries (pg, ioredis, etc.).
		external: [
			"@aws-sdk/client-s3",
			"@google-cloud/bigquery",
			"ioredis",
			"pino",
			"@axiomhq/pino",
			"drizzle-orm",
			"postgres",
			"pg",
			"zod",
		],
		extensions: [
			{
				name: "monorepo-workspace-manifests",
				onBuildComplete: (context) => {
					if (context.target !== "deploy") {
						return;
					}

					context.addLayer({
						id: "monorepo-workspace-manifests",
						image: {
							instructions: [
								"WORKDIR /app",
								`RUN mkdir -p ${workspacePackageDirs.join(" ")} && ${workspacePackageStubs.map(({ dir, contents }) => `printf '${contents}' > ${dir}/package.json`).join(" && ")} && chown -R bun:bun /app`,
							],
						},
					});
				},
			},
			// Server runtime imports `*.lua` as raw text via Bun's loader. esbuild
			// (used by the trigger build) doesn't see bunfig — register a plugin
			// that reads .lua files as text so the same imports work post-bundle.
			{
				name: "lua-text-loader",
				onBuildStart: async (context) => {
					context.registerPlugin({
						name: "lua-text-loader-plugin",
						setup(build) {
							build.onLoad({ filter: /\.lua$/ }, async (args) => {
								const { readFileSync } = await import("node:fs");
								return {
									contents: readFileSync(args.path, "utf-8"),
									loader: "text",
								};
							});
						},
					});
				},
			},
			aptGet({ packages: ["pkg-config", "liblzma-dev"] }),
			additionalPackages({
				packages: [
					"@axiomhq/pino",
					"postgres",
					"pg",
					"drizzle-orm",
					"ioredis",
					"zod",
				],
			}),
			// In DEV: `bun d` runs `bunx trigger.dev dev` under
			// `infisical run --env=dev --recursive --`, so the trigger CLI
			// inherits secrets from process.env directly. `syncEnvVars` only
			// runs at DEPLOY time (pushes Infisical secrets to trigger cloud).
			syncEnvVars(async (ctx) => fetchInfisicalSecretsFromEnv(ctx.env)),
		],
	},
});
