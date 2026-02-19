import { BillingParamsBaseV1Schema } from "@api/billing/common/billingParamsBase/billingParamsBaseV1";
import { z } from "zod/v4";
import { PlanTimingSchema } from "../../../models/billingModels/context/attachBillingContext";
import { RedirectModeSchema } from "../common/redirectMode";
import { AttachDiscountSchema } from "./attachDiscount";

export const AttachParamsV1Schema = BillingParamsBaseV1Schema.extend({
	discounts: z.array(AttachDiscountSchema).optional().meta({
		description:
			"List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.",
	}),

	success_url: z.string().optional().meta({
		description: "URL to redirect to after successful checkout.",
	}),

	redirect_mode: RedirectModeSchema.default("always").meta({
		internal: true,
		description:
			"Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.",
	}),

	new_billing_subscription: z.boolean().optional().meta({
		description:
			"Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one.",
	}),
	plan_schedule: PlanTimingSchema.optional().meta({
		description:
			"When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled.",
	}),
});

export type AttachParamsV1 = z.infer<typeof AttachParamsV1Schema>;
export type AttachParamsV1Input = z.input<typeof AttachParamsV1Schema>;
