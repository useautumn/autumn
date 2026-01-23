import { CreateFreeTrialSchema } from "@models/productModels/freeTrialModels/freeTrialModels";
import { nullish } from "@utils/utils";
import { z } from "zod/v4";
import { FeatureOptionsSchema } from "../../../models/cusProductModels/cusProductModels";
import { ProductItemSchema } from "../../../models/productV2Models/productItemModels/productItemModels";
import { CancelActionSchema } from "../../common/cancelMode";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { BillingParamsBaseSchema } from "../common/billingParamsBase";
import { RefundBehaviorSchema } from "../common/refundBehavior";

export const ExtUpdateSubscriptionV0ParamsSchema =
	BillingParamsBaseSchema.extend({
		// Product identification (optional for update subscription - can target by customer_product_id)
		product_id: z.string().nullish(),

		invoice: z.boolean().optional(),
		enable_product_immediately: z.boolean().optional(),
		finalize_invoice: z.boolean().optional(),
		options: z.array(FeatureOptionsSchema).nullish(), // used for update quantity etc (in api - feature_quantities)

		// New
		version: z.number().optional(),
		items: z.array(ProductItemSchema).optional(), // used for custom configuration of a plan (in api - plan_override)
		free_trial: CreateFreeTrialSchema.nullable().optional(),

		// Cancel action: 'cancel_immediately' | 'cancel_end_of_cycle' | 'uncancel'
		cancel_action: CancelActionSchema.optional(),

		// Billing behavior for subscription updates:
		// - 'prorate_immediately' (default): Invoice line items are charged immediately
		// - 'next_cycle_only': Do NOT create any charges due to the update
		billing_behavior: BillingBehaviorSchema.optional(),

		// Refund behavior for negative invoice totals (downgrades):
		// - 'grant_invoice_credits' (default): Apply credits to customer balance
		// - 'refund_payment_method': Issue refund to payment method
		refund_behavior: RefundBehaviorSchema.optional(),

		// reset_billing_cycle_anchor: z.boolean().optional(),
		// new_billing_subscription: z.boolean().optional(),
	});

export const UpdateSubscriptionV0ParamsSchema =
	ExtUpdateSubscriptionV0ParamsSchema.extend({
		customer_product_id: z.string().optional(),
	})
		.refine(
			(data) => {
				if (data.items && data.items.length === 0) {
					return false;
				}

				return true;
			},
			{
				message:
					"Must provide at least one item when updating to a custom plan",
			},
		)
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
					"items",
					"version",
					"free_trial",
				] as const;
				return !forbiddenFields.some((field) => data[field] !== undefined);
			},
			{
				message:
					"Cannot pass options, items, version, or free_trial when cancel_action is 'cancel_immediately'. Immediate cancellation only processes a prorated refund.",
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

export type ExtUpdateSubscriptionV0Params = z.infer<
	typeof ExtUpdateSubscriptionV0ParamsSchema
>;

export type UpdateSubscriptionV0Params = z.infer<
	typeof UpdateSubscriptionV0ParamsSchema
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
