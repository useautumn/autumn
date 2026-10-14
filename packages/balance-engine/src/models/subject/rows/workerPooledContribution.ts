import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../common/primitives.js";

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
	.loose();

export type WorkerPooledContribution = z.infer<
	typeof workerPooledContributionSchema
>;
