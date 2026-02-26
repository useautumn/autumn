import { z } from "zod/v4";
import { FullCustomerEntitlementSchema } from "../../cusProductModels/cusEntModels/cusEntModels";
import { FullCusProductSchema } from "../../cusProductModels/cusProductModels";
import { FeatureSchema } from "../../featureModels/featureModels";
import { PriceSchema } from "../../productModels/priceModels/priceModels";
import { ProductSchema } from "../../productModels/productModels";

export const BillingPeriodSchema = z.object({
	start: z.number(),
	end: z.number(),
});

export const LineItemContextSchema = z.object({
	price: PriceSchema,
	product: ProductSchema,
	feature: FeatureSchema.optional(),

	currency: z.string(),
	billingPeriod: BillingPeriodSchema.optional(), // Full cycle period (for proration calculation)
	effectivePeriod: BillingPeriodSchema.optional(), // Actual period being charged/refunded (for descriptions and Stripe)
	direction: z.enum(["charge", "refund"]),
	now: z.number(),
	billingTiming: z.enum(["in_arrear", "in_advance"]),
	discountable: z.boolean().optional(), // If true, let Stripe auto-apply discounts to this line item

	// Entity references (optional - not all line items have these)
	customerProduct: FullCusProductSchema.optional(),
	customerEntitlement: FullCustomerEntitlementSchema.optional(),
});

export type BillingPeriod = z.infer<typeof BillingPeriodSchema>;
export type LineItemContext = z.infer<typeof LineItemContextSchema>;
