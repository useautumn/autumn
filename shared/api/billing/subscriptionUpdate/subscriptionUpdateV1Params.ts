import { z } from "zod/v4";
import { PlanOverrideSchema } from "../common/planOverride";

export const SubscriptionUpdateV1ParamsSchema = z.object({
	// Customer / Entity Info
	customer_id: z.string(),
	plan_id: z.string(),

	plan_override: PlanOverrideSchema.optional(),

	// customer_data: CustomerDataSchema.optional(),
	// entity_data: EntityDataSchema.optional(),

	// options: z.array(FeatureOptionsSchema).nullish(),

	// invoice: z.boolean().optional(),
	// enable_product_immediately: z.boolean().optional(),
	// finalize_invoice: z.boolean().optional(),

	// // Reset billing cycle anchor?
	// reset_billing_cycle_anchor: z.boolean().optional(),
	// new_billing_subscription: z.boolean().optional(),
	// prorate_billing: z.boolean().optional(),
});

export type SubscriptionUpdateV1Params = z.infer<
	typeof SubscriptionUpdateV1ParamsSchema
>;
