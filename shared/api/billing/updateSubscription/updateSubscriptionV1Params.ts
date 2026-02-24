import { z } from "zod/v4";
import { BillingParamsBaseV1Schema } from "../common/billingParamsBase/billingParamsBaseV1";
import { CancelActionSchema } from "../common/cancelAction";

export const ExtUpdateSubscriptionV1ParamsSchema =
	BillingParamsBaseV1Schema.extend({
		cancel_action: CancelActionSchema.optional().meta({
			description:
				"Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.",
		}),
	});
export const UpdateSubscriptionV1ParamsSchema =
	ExtUpdateSubscriptionV1ParamsSchema.extend({
		plan_id: z.string().optional(),
		customer_product_id: z.string().optional().meta({
			internal: true,
		}),
	}).refine(
		(data) =>
			data.feature_quantities !== undefined ||
			data.version !== undefined ||
			data.customize !== undefined ||
			data.cancel_action !== undefined,
		{
			message:
				"At least one update parameter must be provided (feature_quantities, version, customize, or cancel_action)",
		},
	);

export type UpdateSubscriptionV1Params = z.infer<
	typeof UpdateSubscriptionV1ParamsSchema
>;

export type UpdateSubscriptionV1ParamsInput = z.input<
	typeof UpdateSubscriptionV1ParamsSchema
>;

// Schedules (epoch milliseconds)
// plan_custom_start_date: z.number().optional(),
// billing_cycle_anchor: z.number().optional(),

// keep_existing_plan: true, //disable_plan_switch
// prorate_billing: true,
// invoice_only: true,

// carry_over_balance: true,
// reset_usage: true,

// billing_custom_start_date: "2025-11-04",
// billing_custom_end_date: "2025-12-04",
// billing_cycle_anchor: "2025-11-04",
// billing_due_date: "2025-11-04",

// new_billing_subscription: true, //fka combine_subscriptions, separate_billing_subscriptions
// require_payment_method: true, //fka force_checkout
// reset_balances: true

// plan_schedule: "immediate", // or "next_cycle", "custom_date"
// plan_custom_start_date: "2025-11-04",
// plan_custom_end_date: "2025-12-04",
// billing_schedule: "immediate", // or "next_cycle", "custom_date"
