import { CusProductStatus } from "@models/cusProductModels/cusProductEnums";
import { z } from "zod/v4";
import { AttachDiscountSchema } from "../attachV2/attachDiscount";
import { BillingCycleAnchorSchema } from "../common/billingCycleAnchor";
import { BillingParamsBaseV1Schema } from "../common/billingParamsBase/billingParamsBaseV1";
import { CancelActionSchema } from "../common/cancelAction";
import { RedirectModeSchema } from "../common/redirectMode";
import { RefundLastPaymentSchema } from "../common/refundLastPayment";

export const ExtUpdateSubscriptionV1ParamsSchema =
	BillingParamsBaseV1Schema.extend({
		plan_id: z.string().optional().meta({
			description:
				"The ID of the plan to update. Optional if subscription_id is provided, or if the customer has only one product.",
		}),
		discounts: z.array(AttachDiscountSchema).optional().meta({
			description:
				"List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.",
		}),
		cancel_action: CancelActionSchema.optional().meta({
			description:
				"Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.",
		}),
		billing_cycle_anchor: BillingCycleAnchorSchema.optional().meta({
			description: "Reset the billing cycle anchor immediately with 'now'",
		}),

		processor_subscription_id: z.string().nullable().optional().meta({
			internal: true,
		}),

		no_billing_changes: z.boolean().optional().meta({
			// internal: true,
			description:
				"If true, the subscription is updated internally without applying billing changes in Stripe.",
		}),

		refund_last_payment: RefundLastPaymentSchema.optional().meta({
			internal: true,
		}),

		recalculate_balances: z
			.object({
				enabled: z.boolean().meta({
					description:
						"If true, recalculates balances during the subscription update. Only applicable when updating feature quantities.",
				}),
			})
			.optional()
			.meta({
				description:
					"Controls whether balances should be recalculated during the subscription update.",
			}),

		status: z
			.enum([
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Expired,
			])
			.optional()
			.meta({
				internal: true,
			}),
	});

const UPDATE_FIELDS = [
	"feature_quantities",
	"version",
	"customize",
	"cancel_action",
	"billing_cycle_anchor",
	"processor_subscription_id",
	"no_billing_changes",
	"refund_last_payment",
	"recalculate_balances",
	"status",
	"redirect_mode",
	"discounts",
] as const satisfies (keyof z.input<
	typeof ExtUpdateSubscriptionV1ParamsSchema
>)[];

export const UpdateSubscriptionV1ParamsSchema =
	ExtUpdateSubscriptionV1ParamsSchema.extend({
		customer_product_id: z.string().optional().meta({
			internal: true,
		}),
		redirect_mode: RedirectModeSchema.optional(),
	})
		.refine((data) => UPDATE_FIELDS.some((key) => data[key] !== undefined), {
			message:
				"At least one update parameter must be provided (feature_quantities, version, customize, cancel_action, recalculate_balances, billing_cycle_anchor, or discounts)",
		})
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
