import { z } from "zod/v4";
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
	billingPeriod: BillingPeriodSchema.optional(), // undefined for one off prices
	direction: z.enum(["charge", "refund"]),
	now: z.number(),
	billingTiming: z.enum(["in_arrear", "in_advance"]),
});

export type BillingPeriod = z.infer<typeof BillingPeriodSchema>;
export type LineItemContext = z.infer<typeof LineItemContextSchema>;
