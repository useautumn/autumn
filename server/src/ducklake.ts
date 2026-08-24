// FC Job Scheduler entrypoint: one-shot container, boots → runs → exits.
import { getAutumnEnv } from "@autumn/env";
import { initInfisical } from "./external/infisical/initInfisical.js";

await initInfisical();
getAutumnEnv();

const { runDucklake } = await import("@autumn/ducklake");
const { logger } = await import("./external/logtail/logtailUtils.js");

const startedAt = performance.now();
try {
	const result = await runDucklake({ logger });
	logger.info(
		{
			type: "ducklake_done",
			durationMs: Math.round(performance.now() - startedAt),
			...result,
		},
		"[ducklake] run complete",
	);
	// Pino's transport buffer must drain before a one-shot process exits.
	await new Promise((resolve) => setTimeout(resolve, 1_000));
	process.exit(0);
} catch (error) {
	logger.error(
		{ type: "ducklake_failed", error: String(error) },
		"[ducklake] run failed",
	);
	await new Promise((resolve) => setTimeout(resolve, 1_000));
	process.exit(1);
}
