import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../common/primitives.js";

/** A pooled_balance_contributions row as a plan carries it: written by the committer, never held in state. Keep in sync with pooledBalanceTable. */
export const workerPooledContributionSchema = z
	.object({
		id: nonEmptyStringSchema,
		pooled_balance_id: nonEmptyStringSchema,
		source_customer_product_id: nonEmptyStringSchema,
		source_customer_entitlement_id: nonEmptyStringSchema,
		current_contribution: finiteNumberSchema,
		next_cycle_contribution: finiteNumberSchema,
		effective_at: finiteNumberSchema.nullable(),
		created_at: finiteNumberSchema,
		updated_at: finiteNumberSchema,
	})
	.strict();

export type WorkerPooledContribution = z.infer<
	typeof workerPooledContributionSchema
>;
