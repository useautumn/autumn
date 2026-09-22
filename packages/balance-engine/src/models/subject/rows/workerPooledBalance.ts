import { PooledBalanceSchema } from "@autumn/shared";
import type { z } from "zod/v4";

/** The pooled_balances columns a balance and a reset read: the pool's grant and how it refills. Only `granted` is ever written, by a reset. */
export const workerPooledBalanceSchema = PooledBalanceSchema.pick({
	id: true,
	customer_entitlement_id: true,
	granted: true,
	unlimited: true,
	reset_mode: true,
}).strict();

export type WorkerPooledBalance = z.infer<typeof workerPooledBalanceSchema>;
