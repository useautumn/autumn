import { ApiPlanV1Schema } from "@api/products/apiPlanV1";
import { z } from "zod/v4";

/**
 * A change in the checkout (product being added, canceled, or expiring)
 */
export const BillingPreviewChangeSchema = z.object({
	plan_id: z.string(),
	plan: ApiPlanV1Schema.optional(),
	feature_quantities: z.array(
		z.object({
			feature_id: z.string(),
			quantity: z.number(),
		}),
	),
	expires_at: z.number().nullable(),
	// balances: z.record(z.string(), ApiBalanceV1Schema),
});

export type BillingPreviewChange = z.infer<typeof BillingPreviewChangeSchema>;
