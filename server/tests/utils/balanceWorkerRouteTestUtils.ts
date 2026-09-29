import { parseBalanceWorkerRolloutOverride } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";

/** Whether the server under test routes customers through the balance worker; the test process shares its env file. */
export const isBalanceWorkerRoute = (): boolean =>
	parseBalanceWorkerRolloutOverride({ runtimeEnv: process.env }) ??
	// "config" defers to the rollout config, which the tw edge-config override enables globally.
	Boolean(process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64);
