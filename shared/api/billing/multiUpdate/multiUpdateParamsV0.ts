import { z } from "zod/v4";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { CancelActionSchema } from "../common/cancelAction";
import { CancellationDetailsSchema } from "../common/cancellationDetails";
import { RefundLastPaymentSchema } from "../common/refundLastPayment";

const applyMultiUpdateItemRefinements = <
	Schema extends z.ZodType<{
		cancel_action: z.infer<typeof CancelActionSchema>;
		proration_behavior?: z.infer<typeof BillingBehaviorSchema>;
		refund_last_payment?: z.infer<typeof RefundLastPaymentSchema>;
		cancellation_details?: z.infer<typeof CancellationDetailsSchema>;
	}>,
>(
	schema: Schema,
) =>
	schema
		.refine((data) => !(data.refund_last_payment && data.proration_behavior), {
			message:
				"Cannot pass both proration_behavior and refund_last_payment. Use proration_behavior for invoice credits/proration, or refund_last_payment for direct refunds.",
		})
		.refine(
			(data) =>
				!(
					data.refund_last_payment &&
					data.cancel_action !== "cancel_immediately"
				),
			{
				message:
					"refund_last_payment requires cancel_action to be 'cancel_immediately'.",
			},
		)
		.refine(
			(data) =>
				!(data.cancellation_details && data.cancel_action === "uncancel"),
			{
				message:
					"cancellation_details cannot be passed when cancel_action is 'uncancel'.",
			},
		);

/** Per-update entry in the multi-update request (external fields only) */
const extMultiUpdateItemShape = z.object({
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
	refund_last_payment: RefundLastPaymentSchema.optional(),
	cancellation_details: CancellationDetailsSchema.optional().meta({
		description:
			"Reason and details forwarded to Stripe as cancellation_details when this update cancels the Stripe subscription.",
	}),
});

export const ExtMultiUpdateItemV0Schema = applyMultiUpdateItemRefinements(
	extMultiUpdateItemShape,
);

export const MultiUpdateItemV0Schema = applyMultiUpdateItemRefinements(
	extMultiUpdateItemShape.extend({
		customer_product_id: z.string().optional().meta({
			internal: true,
		}),
	}),
);

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
