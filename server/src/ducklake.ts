export {};
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
