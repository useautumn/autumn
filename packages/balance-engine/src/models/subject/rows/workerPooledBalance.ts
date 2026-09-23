import { PooledBalanceSchema } from "@autumn/shared";
import type { z } from "zod/v4";

/** The whole pooled_balances row: a plan inserts it, a reset moves `granted` and stamps `last_applied_reset_at`. */
export const workerPooledBalanceSchema = PooledBalanceSchema.strict();

export type WorkerPooledBalance = z.infer<typeof workerPooledBalanceSchema>;
