import { parseBalanceShadowConfig } from "@server/internal/balances/shadow/parseBalanceShadowConfig.js";
import { parseShadowOperatorArgs } from "./parseShadowOperatorArgs.js";

const usage = `Usage: bun scripts/balance-shadow/balance-shadow.ts --mode initialize|compare --confirm-quiet [--execute]

Reads BALANCE_WORKER_SHADOW and the existing Kafka/client environment settings.
Initialize previews by default; --execute writes only to the isolated shadow worker.
Compare only reads; an expired run is allowed. Direct routing must remain disabled.
Pause cohort mutations and drain pending/in-flight copies on ALL processes first.
Equal values are a point-in-time observation, not proof that no copies were lost.
Use PW_MODE=1 with injected staging/prod secrets to avoid local worktree overrides.
`;

async function main() {
	const options = parseShadowOperatorArgs({ args: process.argv.slice(2) });
	if (options.help) {
		console.log(usage);
		return 0;
	}
	const config = parseBalanceShadowConfig({
		runtimeEnv: process.env,
		purpose: options.mode === "compare" ? "inspect" : "run",
	});
	if (!config) throw new Error("BALANCE_WORKER_SHADOW is required");
	console.log(
		JSON.stringify({
			runId: config.runId,
			ownershipTopic: config.ownershipTopic,
			mode: options.mode,
			execute: options.execute,
			cohortEntries: config.customers.length,
		}),
	);
	const { runShadowOperator } = await import("./runShadowOperator.js");
	const results = await runShadowOperator({
		config,
		mode: options.mode,
		execute: options.execute,
	});
	return results.every(
		({ status }) => status === "preview" || status === "equal_at_read",
	)
		? 0
		: 1;
}

if (import.meta.main) {
	const deadline = setTimeout(() => {
		console.error(
			"Operator deadline exceeded. Initialization may have committed; inspect before retrying.",
		);
		process.exit(1);
	}, 120_000);
	try {
		process.exit(await main());
	} catch (error) {
		console.error(error instanceof Error ? error.message : "Operator failed");
		process.exit(1);
	} finally {
		clearTimeout(deadline);
	}
}
