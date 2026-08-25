// FC Job Scheduler entrypoint: one-shot container, boots → runs → exits.
// Everything (Infisical included) sits inside the try so a startup failure
// still surfaces diagnostics: console.error lands in the `ecs` dataset via
// firelens even when the structured logger never came up.
export {}; // all imports are dynamic; this keeps the file a module for TLA
const startedAt = performance.now();

try {
	const { getAutumnEnv } = await import("@autumn/env");
	const { initInfisical } = await import(
		"./external/infisical/initInfisical.js"
	);
	await initInfisical();
	getAutumnEnv();

	const { runDucklake } = await import("@autumn/ducklake");
	const { logger } = await import("./external/logtail/logtailUtils.js");

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
} catch (error) {
	console.error(`[ducklake] startup failed: ${error}`);
	process.exit(1);
}
