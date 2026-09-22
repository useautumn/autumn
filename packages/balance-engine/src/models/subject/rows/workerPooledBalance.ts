import { PooledBalanceSchema } from "@autumn/shared";
import type { z } from "zod/v4";

/** The pooled_balances columns a balance reads: the pool's grant. The worker never writes this table; billing does, and evicts. */
export const workerPooledBalanceSchema = PooledBalanceSchema.pick({
	id: true,
	customer_entitlement_id: true,
	granted: true,
	unlimited: true,
}).strict();

export type WorkerPooledBalance = z.infer<typeof workerPooledBalanceSchema>;
