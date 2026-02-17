import { nullish } from "@utils/utils";
import { z } from "zod/v4";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { BillingParamsBaseV1Schema } from "../common/billingParamsBase/billingParamsBaseV1";
import { CancelActionSchema } from "../common/cancelAction";

export const UpdateSubscriptionV1ParamsSchema =
	BillingParamsBaseV1Schema.extend({
		product_id: z.string().nullish(),

		invoice: z.boolean().optional(),
		enable_product_immediately: z.boolean().optional(),
		finalize_invoice: z.boolean().optional(),

		cancel_action: CancelActionSchema.optional(),
		billing_behavior: BillingBehaviorSchema.optional(),

		customer_product_id: z.string().optional().meta({
			internal: true,
		}),
	})

		.check((ctx) => {
			if (ctx.value.options && ctx.value.options.length > 0) {
				const invalidFeatures = ctx.value.options
					.filter((opt) => nullish(opt.quantity) || opt.quantity < 0)
					.map((opt) => opt.feature_id);

				if (invalidFeatures.length > 0) {
					ctx.issues.push({
						code: "custom",
						message: `Options quantity must be >= 0 for features: ${invalidFeatures.join(", ")}`,
						input: ctx.value,
					});
				}
			}
		})
		.refine(
			(data) => {
				if (data.cancel_action !== "cancel_immediately") return true;

				const forbiddenFields = [
					"options",
					"version",
					"free_trial",
					"customize",
				] as const;
				return !forbiddenFields.some((field) => data[field] !== undefined);
			},
			{
				message:
					"Cannot pass options, customize, version, or free_trial when cancel_action is 'cancel_immediately'. Immediate cancellation only processes a prorated refund.",
			},
		)
		.refine(
			(data) => {
				if (data.cancel_action !== "cancel_end_of_cycle") return true;

				// Cannot pass free_trial when cancel_action is 'cancel_end_of_cycle'
				return data.free_trial === undefined;
			},
			{
				message:
					"Cannot pass free_trial when cancel_action is 'cancel_end_of_cycle'.",
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
