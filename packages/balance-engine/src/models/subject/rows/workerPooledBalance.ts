import { PooledBalanceSchema } from "@autumn/shared";
import type { z } from "zod/v4";
import { openSchema } from "../../common/openSchema.js";

export const workerPooledBalanceSchema = openSchema({
	name: "workerPooledBalance",
	schema: PooledBalanceSchema,
});

export type WorkerPooledBalance = z.infer<typeof workerPooledBalanceSchema>;
