import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

type ResetEnvironment = "staging" | "prod";

const WRAPPED_ENV_VAR = "AUTUMN_RESET_V2_WRAPPED";
const ENV_FILES: Record<ResetEnvironment, string> = {
	staging: ".env.staging",
	prod: ".env.prod",
};

const parseEnvironment = (): ResetEnvironment => {
	const environment = process.argv[2];
	if (environment === "staging" || environment === "prod") return environment;

	console.error("Usage: bun reset-v2 <staging|prod>");
	process.exit(2);
};

const runWithInfisical = async ({
	environment,
}: {
	environment: ResetEnvironment;
}) => {
	const child = spawn(
		"infisical",
		[
			"run",
			`--env=${environment}`,
			"--recursive",
			"--",
			"bun",
			fileURLToPath(import.meta.url),
			environment,
		],
		{
			stdio: "inherit",
			env: {
				...process.env,
				[WRAPPED_ENV_VAR]: "1",
				ENV_FILE: ENV_FILES[environment],
				NODE_ENV: "development",
			},
		},
	);

	const exitCode = await new Promise<number>((resolve) => {
		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", (error) => {
			console.error(`Failed to start Infisical: ${error.message}`);
			resolve(1);
		});
	});
	process.exit(exitCode);
};

const runResetV2 = async ({
	environment,
}: {
	environment: ResetEnvironment;
}) => {
	await import("../sentry.js");
	await import("../internal/misc/resetJobV2/resetJobV2Store.js");

	const { initDrizzle } = await import("../db/initDrizzle.js");
	const { startPgPoolMonitor, stopPgPoolMonitor } = await import(
		"../db/pgPoolMonitor.js"
	);
	const { logger } = await import("../external/logtail/logtailUtils.js");
	const { runResetLoopV2 } = await import(
		"../internal/balances/batchReset/runResetLoopV2.js"
	);
	const { getResetJobV2Config, getResetJobV2ConfigStatus } = await import(
		"../internal/misc/resetJobV2/resetJobV2Store.js"
	);
	const { startAllEdgeConfigPolling, stopAllEdgeConfigPolling } = await import(
		"../internal/misc/edgeConfig/edgeConfigRegistry.js"
	);

	await startAllEdgeConfigPolling({ logger });

	const { db, client } = initDrizzle({
		name: "reset-cron-v2",
		maxConnections: 10,
	});
	startPgPoolMonitor();

	const controller = new AbortController();
	const loopPromise = runResetLoopV2({
		ctx: { db, logger },
		signal: controller.signal,
	});
	let shuttingDown = false;

	// Everything under `data`: the express dataset is at its Axiom column
	// limit, so new top-level (flattened) field names get the whole ingest
	// batch rejected.
	logger.info("[reset-cus-ents-v2] dedicated scanner started", {
		jobName: "reset-cus-ents-v2",
		data: {
			environment,
			config: getResetJobV2Config(),
			configStatus: getResetJobV2ConfigStatus(),
		},
	});

	// The scanner must never die because telemetry hiccuped (e.g. an Axiom
	// ingest rejection inside the pino transport becomes an unhandled
	// rejection, which kills the process by default).
	process.on("unhandledRejection", (reason) => {
		console.error("[reset-cus-ents-v2] unhandled rejection (ignored):", reason);
	});

	const shutdown = async (signal: string) => {
		if (shuttingDown) return;
		shuttingDown = true;
		logger.info(`[reset-cus-ents-v2] received ${signal}, shutting down`);
		controller.abort();
		stopPgPoolMonitor();
		stopAllEdgeConfigPolling();
		await loopPromise;
		await client.end();
	};

	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));

	await loopPromise;
};

const main = async () => {
	const environment = parseEnvironment();
	if (process.env[WRAPPED_ENV_VAR] !== "1") {
		await runWithInfisical({ environment });
		return;
	}

	await runResetV2({ environment });
};

await main();
