import { RedirectModeSchema } from "@api/billing/common/redirectMode.js";
import { z } from "zod/v4";
import { PlanTimingSchema } from "../../../models/billingModels/context/attachBillingContext.js";
import { ProductItemSchema } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { BillingBehaviorSchema } from "../common/billingBehavior.js";
import { BillingParamsBaseV0Schema } from "../common/billingParamsBase/billingParamsBaseV0.js";

export const ExtAttachParamsV0Schema = BillingParamsBaseV0Schema.extend({
	// Product identification
	product_id: z.string(),

	// Invoice mode
	invoice: z.boolean().optional(),
	enable_product_immediately: z.boolean().optional(),
	finalize_invoice: z.boolean().optional(),

	// Checkout behavior
	redirect_mode: RedirectModeSchema.default("always"),
	success_url: z.string().optional(),

	new_billing_subscription: z.boolean().optional(),

	plan_schedule: PlanTimingSchema.optional(),

	// Billing behavior for attach operations (product transitions):
	// - 'prorate_immediately' (default): Invoice line items are charged immediately
	// - 'next_cycle_only': Do NOT create any charges due to the attach
	billing_behavior: BillingBehaviorSchema.optional(),

	adjustable_quantity: z.boolean().optional(),
});

export const AttachParamsV0Schema = ExtAttachParamsV0Schema.extend({
	// Custom product configuration
	items: z.array(ProductItemSchema).optional(),
}).refine(
	(data) => {
		if (data.items && data.items.length === 0) {
			return false;
		}
		return true;
	},
	{
		message: "Must provide at least one item when using custom plan",
	},
);

export type ExtAttachParamsV0 = z.input<typeof ExtAttachParamsV0Schema>;
export type AttachParamsV0 = z.infer<typeof AttachParamsV0Schema>;
export type AttachParamsV0Input = z.input<typeof AttachParamsV0Schema>;
