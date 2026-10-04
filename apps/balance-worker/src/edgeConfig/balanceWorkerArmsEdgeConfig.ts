import { z } from "zod/v4";

/** Which A/B arms run on staging; infra's `set_bw_arms` writes it, every worker polls it. */
export const BALANCE_WORKER_ARMS_KEY = "admin/balance-worker-arms.json";

export const BalanceWorkerArmsEdgeConfigSchema = z.object({
	arms: z.array(z.string()),
	updatedAt: z.string(),
	updatedBy: z.string().optional(),
	reason: z.string().optional(),
});

export type BalanceWorkerArmsEdgeConfig = z.infer<
	typeof BalanceWorkerArmsEdgeConfigSchema
>;

export const defaultBalanceWorkerArmsEdgeConfig =
	(): BalanceWorkerArmsEdgeConfig => ({
		arms: [],
		updatedAt: new Date(0).toISOString(),
	});

export const balanceWorkerArmsEdgeConfig = {
	key: BALANCE_WORKER_ARMS_KEY,
	schema: BalanceWorkerArmsEdgeConfigSchema,
	defaultValue: defaultBalanceWorkerArmsEdgeConfig,
} as const;
