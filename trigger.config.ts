import {
	additionalFiles,
	additionalPackages,
	aptGet,
	syncEnvVars,
} from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk/v3";
import { fetchInfisicalSecretsFromEnv } from "./server/src/external/infisical/fetchInfisicalSecrets.js";

const workspacePackageJsonPaths = [
	"server/package.json",
	"shared/package.json",
	"vite/package.json",
	"scripts/package.json",
	"apps/checkout/package.json",
	"apps/docs/package.json",
	"apps/website/package.json",
	"apps/leaf/package.json",
	"apps/sdk-test/package.json",
	"packages/atmn/package.json",
	"packages/atmn-tests/package.json",
	"packages/auth/package.json",
	"packages/logging/package.json",
	"packages/mcp/package.json",
	"packages/sdk/package.json",
	"packages/autumn-js/package.json",
	"packages/openapi/package.json",
	"packages/ksuid/package.json",
	"packages/stripe-sync/package.json",
];

const workspacePackageDirs = workspacePackageJsonPaths.map((path) =>
	path.replace(/\/package\.json$/, ""),
);

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
	dirs: ["server/src/trigger"],
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
			additionalFiles({
				files: workspacePackageJsonPaths,
			}),
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
								`RUN mkdir -p ${workspacePackageDirs.join(" ")} && chown -R bun:bun ${workspacePackageDirs.join(" ")}`,
								...workspacePackageJsonPaths.map(
									(path) => `COPY --chown=bun:bun ${path} ./${path}`,
								),
								"RUN chown -R bun:bun /app",
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
