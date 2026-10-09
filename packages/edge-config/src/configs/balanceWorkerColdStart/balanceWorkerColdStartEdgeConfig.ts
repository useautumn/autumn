import { z } from "zod/v4";
import { BALANCE_WORKER_COLD_START_KEY } from "../../keys.js";

/** A staging load test's request to empty every worker's resident subjects; each new `requestId` is one eviction. */
export const BalanceWorkerColdStartEdgeConfigSchema = z
	.object({
		requestId: z.string().trim().min(1).max(128).nullable().default(null),
	})
	.strict();

export type BalanceWorkerColdStartEdgeConfig = z.infer<
	typeof BalanceWorkerColdStartEdgeConfigSchema
>;

export const defaultBalanceWorkerColdStartEdgeConfig =
	(): BalanceWorkerColdStartEdgeConfig => ({ requestId: null });

export const balanceWorkerColdStartEdgeConfig = {
	key: BALANCE_WORKER_COLD_START_KEY,
	schema: BalanceWorkerColdStartEdgeConfigSchema,
	defaultValue: defaultBalanceWorkerColdStartEdgeConfig,
} as const;
