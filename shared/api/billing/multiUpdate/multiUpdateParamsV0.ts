import { z } from "zod/v4";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { CancelActionSchema } from "../common/cancelAction";

/** Per-update entry in the multi-update request */
export const MultiUpdateItemV0Schema = z.object({
	plan_id: z.string().optional().meta({
		description:
			"The ID of the plan to update. Optional if subscription_id is provided.",
	}),
	subscription_id: z.string().optional().meta({
		description:
			"A unique ID to identify the subscription to update. Useful when a customer has multiple products with the same plan.",
	}),
	customer_product_id: z.string().optional().meta({
		internal: true,
	}),
	entity_id: z.string().optional().meta({
		description:
			"The ID of the entity this update targets. Overrides the top-level entity_id for this update.",
	}),
	cancel_action: CancelActionSchema.meta({
		description:
			"Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.",
	}),
	proration_behavior: BillingBehaviorSchema.optional().meta({
		description:
			"How to handle proration for this update. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.",
	}),
});

export const MultiUpdateParamsV0Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer to update plans for.",
	}),
	entity_id: z.string().optional().meta({
		description:
			"The ID of the entity to update plans for. Individual updates can override this with their own entity_id.",
	}),
	updates: z
		.array(MultiUpdateItemV0Schema)
		.min(1, "At least one update must be provided")
		.meta({
			description: "The list of plan updates to apply to the customer.",
		}),
});

export type MultiUpdateItemV0 = z.infer<typeof MultiUpdateItemV0Schema>;
export type MultiUpdateParamsV0 = z.infer<typeof MultiUpdateParamsV0Schema>;
export type MultiUpdateParamsV0Input = z.input<
	typeof MultiUpdateParamsV0Schema
>;
