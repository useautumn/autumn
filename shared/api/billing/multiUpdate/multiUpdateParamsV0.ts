import { z } from "zod/v4";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { CancelActionSchema } from "../common/cancelAction";

/** Per-update entry in the multi-update request (external fields only) */
export const ExtMultiUpdateItemV0Schema = z.object({
	plan_id: z.string().optional().meta({
		description:
			"The ID of the plan to update. Optional if subscription_id is provided.",
	}),
	subscription_id: z.string().optional().meta({
		description:
			"A unique ID to identify the subscription to update. Useful when a customer has multiple products with the same plan.",
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

export const MultiUpdateItemV0Schema = ExtMultiUpdateItemV0Schema.extend({
	customer_product_id: z.string().optional().meta({
		internal: true,
	}),
});

const multiUpdateParamsBase = {
	customer_id: z.string().meta({
		description: "The ID of the customer to update plans for.",
	}),
	entity_id: z.string().optional().meta({
		description:
			"The ID of the entity to update plans for. Individual updates can override this with their own entity_id.",
	}),
};

const updatesMeta = {
	description: "The list of plan updates to apply to the customer.",
};

export const ExtMultiUpdateParamsV0Schema = z.object({
	...multiUpdateParamsBase,
	updates: z
		.array(ExtMultiUpdateItemV0Schema)
		.min(1, "At least one update must be provided")
		.meta(updatesMeta),
});

export const MultiUpdateParamsV0Schema = z.object({
	...multiUpdateParamsBase,
	updates: z
		.array(MultiUpdateItemV0Schema)
		.min(1, "At least one update must be provided")
		.meta(updatesMeta),
});

export type MultiUpdateItemV0 = z.infer<typeof MultiUpdateItemV0Schema>;
export type MultiUpdateParamsV0 = z.infer<typeof MultiUpdateParamsV0Schema>;
export type MultiUpdateParamsV0Input = z.input<
	typeof MultiUpdateParamsV0Schema
>;
