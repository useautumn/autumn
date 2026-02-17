import { BillingParamsBaseV1Schema } from "@api/billing/common/billingParamsBase/billingParamsBaseV1.js";
import { z } from "zod/v4";
import { PlanTimingSchema } from "../../../models/billingModels/context/attachBillingContext.js";
import { BillingBehaviorSchema } from "../common/billingBehavior.js";
import { InvoiceModeParamsSchema } from "../common/invoiceModeParams.js";
import { RedirectModeSchema } from "../common/redirectMode.js";
import { AttachDiscountSchema } from "./attachDiscount.js";

export const AttachParamsV1Schema = BillingParamsBaseV1Schema.extend({
	// Product identification
	plan_id: z.string(),

	// Invoice mode
	// invoice: z.boolean().optional(),
	// enable_product_immediately: z.boolean().optional(),
	// finalize_invoice: z.boolean().optional(),
	invoice_mode: InvoiceModeParamsSchema.optional(),

	// Checkout behavior
	discounts: z.array(AttachDiscountSchema).optional(),
	redirect_mode: RedirectModeSchema.default("always"),
	success_url: z.string().optional(),
	new_billing_subscription: z.boolean().optional(),
	plan_schedule: PlanTimingSchema.optional(),
	billing_behavior: BillingBehaviorSchema.optional(),
});

// export const AttachParamsV1Schema = ExtAttachParamsV1Schema.extend({
// 	// Custom product configuration
// 	items: z.array(ProductItemSchema).optional(),
// }).refine(
// 	(data) => {
// 		if (data.items && data.items.length === 0) {
// 			return false;
// 		}
// 		return true;
// 	},
// 	{
// 		message: "Must provide at least one item when using custom plan",
// 	},
// );

export type AttachParamsV1 = z.infer<typeof AttachParamsV1Schema>;
export type AttachParamsV1Input = z.input<typeof AttachParamsV1Schema>;
