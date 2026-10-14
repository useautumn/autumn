import { parseBalanceWorkerRolloutOverride } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";

export const isBalanceWorkerRoute = (): boolean =>
	parseBalanceWorkerRolloutOverride({ runtimeEnv: process.env }) ??
	Boolean(process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64);
