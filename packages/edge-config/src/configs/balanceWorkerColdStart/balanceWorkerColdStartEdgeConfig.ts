import { z } from "zod/v4";
import { BALANCE_WORKER_COLD_START_KEY } from "../../keys.js";

/** A staging load test's request to empty worker memory; each new `requestId` is one eviction of the scope it carries. */
export const BalanceWorkerColdStartEdgeConfigSchema = z
	.object({
		requestId: z.string().trim().min(1).max(128).nullable().default(null),
		/** Share of customers evicted, picked by a hash of the customer key so a rerun evicts the same ones. */
		fraction: z.number().min(0).max(1).default(1),
		/** Subjects read or written this recently stay resident, as they would after a deploy that long ago. */
		keepActiveWithinMs: z.number().int().positive().nullable().default(null),
	})
	.strict();

export type BalanceWorkerColdStartEdgeConfig = z.infer<
	typeof BalanceWorkerColdStartEdgeConfigSchema
>;

export type ColdStartScope = Pick<
	BalanceWorkerColdStartEdgeConfig,
	"fraction" | "keepActiveWithinMs"
>;

export const defaultBalanceWorkerColdStartEdgeConfig =
	(): BalanceWorkerColdStartEdgeConfig => ({
		requestId: null,
		fraction: 1,
		keepActiveWithinMs: null,
	});

export const balanceWorkerColdStartEdgeConfig = {
	key: BALANCE_WORKER_COLD_START_KEY,
	schema: BalanceWorkerColdStartEdgeConfigSchema,
	defaultValue: defaultBalanceWorkerColdStartEdgeConfig,
} as const;
