import { z } from "zod/v4";
import { FullCustomerEntitlementSchema } from "../../cusProductModels/cusEntModels/cusEntModels";
import { FullCustomerPriceSchema } from "../../cusProductModels/cusPriceModels/cusPriceModels";
import { FullCusProductSchema } from "../../cusProductModels/cusProductModels";
import { FeatureSchema } from "../../featureModels/featureModels";
import { EntitySchema } from "../../cusModels/entityModels/entityModels";
import { PriceSchema } from "../../productModels/priceModels/priceModels";
import { ProductSchema } from "../../productModels/productModels";

export const BillingPeriodSchema = z.object({
	start: z.number(),
	end: z.number(),
});

export const LineItemBackdateSchema = z.object({
	startsAt: z.number(),
	cycleCount: z.number(),
});

export const LineItemContextSchema = z.object({
	price: PriceSchema,
	product: ProductSchema,
	feature: FeatureSchema.optional(),

	currency: z.string(),
	billingPeriod: BillingPeriodSchema.optional(),
	effectivePeriod: BillingPeriodSchema.optional(),
	direction: z.enum(["charge", "refund"]),
	now: z.number(),
	billingTiming: z.enum(["in_arrear", "in_advance"]),
	discountable: z.boolean().optional(),
	backdate: LineItemBackdateSchema.optional(),

	entity: EntitySchema.optional(),
	customerProduct: FullCusProductSchema.optional(),
	customerPrice: FullCustomerPriceSchema.optional(),
	customerEntitlement: FullCustomerEntitlementSchema.optional(),
});

export type BillingPeriod = z.infer<typeof BillingPeriodSchema>;
export type LineItemContext = z.infer<typeof LineItemContextSchema>;
