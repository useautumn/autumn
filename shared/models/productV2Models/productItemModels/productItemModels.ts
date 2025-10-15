import { z } from "zod/v4";
import { Infinite } from "../../productModels/productEnums.js";
import { OnDecrease, OnIncrease } from "./productItemEnums.js";

export const TierInfinite = "inf";

export enum ProductItemInterval {
	// None = "none",

	// Reset interval
	Minute = "minute",
	Hour = "hour",
	Day = "day",
	Week = "week",

	// Billing interval
	Month = "month",
	Quarter = "quarter",
	SemiAnnual = "semi_annual",
	Year = "year",
}

export enum ProductItemType {
	Feature = "feature",
	FeaturePrice = "priced_feature",
	Price = "price",
}

export const PriceTierSchema = z.object({
	to: z.number().or(z.literal(TierInfinite)).meta({
		description: "The maximum amount of usage for this tier.",
		example: 100,
	}),
	amount: z.number().meta({
		description: "The price of the product item for this tier.",
		example: 10,
	}),
});

export enum UsageModel {
	Prepaid = "prepaid",
	PayPerUse = "pay_per_use",
}

export enum ProductItemFeatureType {
	SingleUse = "single_use",
	ContinuousUse = "continuous_use",
	Boolean = "boolean",
	Static = "static",
}

export enum RolloverDuration {
	Month = "month",
	Forever = "forever",
}

export const RolloverConfigSchema = z.object({
	max: z.number().nullable(),
	duration: z.nativeEnum(RolloverDuration).default(RolloverDuration.Month),
	length: z.number(),
});

const ProductItemConfigSchema = z.object({
	on_increase: z.nativeEnum(OnIncrease).nullish(),
	on_decrease: z.nativeEnum(OnDecrease).nullish(),
	rollover: RolloverConfigSchema.nullish(),
});

export const ProductItemSchema = z.object({
	// Feature stuff
	feature_id: z.string().nullish(),
	feature_type: z.nativeEnum(ProductItemFeatureType).nullish(),
	included_usage: z.union([z.number(), z.literal(Infinite)]).nullish(),
	interval: z.nativeEnum(ProductItemInterval).nullish(),
	interval_count: z.number().nullish(),
	entity_feature_id: z.string().nullish(),

	// Price config
	usage_model: z.nativeEnum(UsageModel).nullish(),
	price: z.number().nullish(),
	tiers: z.array(PriceTierSchema).nullish(),
	billing_units: z.number().nullish(), // amount per billing unit (eg. $9 / 250 units)
	usage_limit: z.number().nullish(),

	// Others
	// carry_over_usage: z.boolean().nullish(),
	reset_usage_when_enabled: z.boolean().nullish(),

	config: ProductItemConfigSchema.nullish(),

	// Stored in backend
	created_at: z.number().nullish(),
	entitlement_id: z.string().nullish(),
	price_id: z.string().nullish(),
	price_config: z.any().nullish(),
});

export const LimitedItemSchema = ProductItemSchema.extend({
	included_usage: z.number(),
});

export const FrontendProductItem = ProductItemSchema.extend({
	isPrice: z.boolean(),
	isVariable: z.boolean().nullish(),
});

export type ProductItem = z.infer<typeof ProductItemSchema>;
export type LimitedItem = z.infer<typeof LimitedItemSchema>;
export type ProductItemConfig = z.infer<typeof ProductItemConfigSchema>;
export type PriceTier = z.infer<typeof PriceTierSchema>;
export type RolloverConfig = z.infer<typeof RolloverConfigSchema>;
export type FrontendProductItem = z.infer<typeof FrontendProductItem>;
