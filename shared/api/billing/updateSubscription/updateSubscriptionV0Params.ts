import { CusProductStatus } from "@models/cusProductModels/cusProductEnums";
import { nullish } from "@utils/utils";
import { z } from "zod/v4";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { BillingParamsBaseV0Schema } from "../common/billingParamsBase/billingParamsBaseV0";
import { CancelActionSchema } from "../common/cancelAction";
import { RedirectModeSchema } from "../common/redirectMode";

export const ExtUpdateSubscriptionV0ParamsSchema =
	BillingParamsBaseV0Schema.extend({
		// Product identification (optional for update subscription - can target by customer_product_id)
		product_id: z.string().nullish(),

		invoice: z.boolean().optional(),
		enable_product_immediately: z.boolean().optional(),
		finalize_invoice: z.boolean().optional(),

		// New

		// Cancel action: 'cancel_immediately' | 'cancel_end_of_cycle' | 'uncancel'
		cancel_action: CancelActionSchema.optional(),

		// Billing behavior for subscription updates:
		// - 'prorate_immediately' (default): Invoice line items are charged immediately
		// - 'next_cycle_only': Do NOT create any charges due to the update
		billing_behavior: BillingBehaviorSchema.optional(),

		processor_subscription_id: z.string().nullable().optional(),
		no_billing_changes: z.boolean().optional(),
		status: z
			.enum([
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Expired,
			])
			.optional(),
	});

export const UpdateSubscriptionV0ParamsSchema =
	ExtUpdateSubscriptionV0ParamsSchema.extend({
		customer_product_id: z.string().optional(),
		redirect_mode: RedirectModeSchema.optional(),
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
