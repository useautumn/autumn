import { BillingParamsBaseV1Schema } from "@api/billing/common/billingParamsBase/billingParamsBaseV1";
import { z } from "zod/v4";
import { PlanTimingSchema } from "../../../models/billingModels/context/attachBillingContext";
import { BillingCycleAnchorSchema } from "../common/billingCycleAnchor";
import { CustomLineItemSchema } from "../common/customLineItem";
import { AttachDiscountSchema } from "./attachDiscount";

export const AttachParamsV1Schema = BillingParamsBaseV1Schema.extend({
	discounts: z.array(AttachDiscountSchema).optional().meta({
		description:
			"List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.",
	}),

	success_url: z.string().optional().meta({
		description: "URL to redirect to after successful checkout.",
	}),

	new_billing_subscription: z.boolean().optional().meta({
		description:
			"Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one.",
	}),
	billing_cycle_anchor: BillingCycleAnchorSchema.optional().meta({
		description:
			"Reset the billing cycle anchor immediately with 'now' or schedule it for a future Unix timestamp in milliseconds.",
	}),
	plan_schedule: PlanTimingSchema.optional().meta({
		description:
			"When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled.",
	}),

	checkout_session_params: z.record(z.string(), z.unknown()).optional().meta({
		description:
			"Additional parameters to pass into the creation of the Stripe checkout session.",
	}),

	custom_line_items: z.array(CustomLineItemSchema).optional().meta({
		description:
			"Custom line items that override the auto-generated proration invoice. Only valid for immediate plan changes (eg. upgrades or one off plans).",
	}),

	processor_subscription_id: z.string().optional().meta({
		// internal: true,
		description:
			"The processor subscription ID to link. Use this to attach an existing Stripe subscription instead of creating a new one.",
	}),

	carry_over_balances: z
		.object({
			enabled: z.boolean().meta({
				description: "Whether to carry over balances from the previous plan.",
			}),
			feature_ids: z.array(z.string()).optional().meta({
				description:
					"The IDs of the features to carry over balances from. If left undefined, all features will be carried over.",
			}),
		})
		.optional()
		.meta({
			description: "Whether to carry over balances from the previous plan.",
		}),

	carry_over_usages: z
		.object({
			enabled: z.boolean().meta({
				description: "Whether to carry over usages from the previous plan.",
			}),
			feature_ids: z.array(z.string()).optional().meta({
				description:
					"The IDs of the features to carry over usages for. If left undefined, all consumable features will be carried over.",
			}),
		})
		.optional()
		.meta({
			description: "Whether to carry over usages from the previous plan.",
		}),

	no_billing_changes: z.boolean().optional().meta({
		internal: true,
	}),
});

export type AttachParamsV1 = z.infer<typeof AttachParamsV1Schema>;
export type AttachParamsV1Input = z.input<typeof AttachParamsV1Schema>;
