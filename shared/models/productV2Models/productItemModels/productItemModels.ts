import { z } from "zod/v4";
import { ApiFeatureV0Schema } from "../../../api/features/prevVersions/apiFeatureV0.js";
import { RolloverExpiryDurationType } from "../../productModels/durationTypes/rolloverExpiryDurationType.js";
import { ProductItemInterval } from "../../productModels/intervals/productItemInterval.js";
import { TierBehaviours } from "../../productModels/priceModels/priceConfig/usagePriceConfig.js";
import { Infinite } from "../../productModels/productEnums.js";
import { OnDecrease, OnIncrease } from "./productItemEnums.js";

export const TierInfinite = "inf";

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

export const RolloverConfigSchema = z.object({
	max: z.number().nullable(),
	duration: z
		.enum(RolloverExpiryDurationType)
		.default(RolloverExpiryDurationType.Month),
	length: z.number(),
});

const ProductItemConfigSchema = z.object({
	on_increase: z.enum(OnIncrease).nullish(),
	on_decrease: z.enum(OnDecrease).nullish(),
	rollover: RolloverConfigSchema.nullish(),
});

export const ProductItemSchema = z.object({
	type: z.enum(ProductItemType).nullish().meta({
		description: "The type of the product item.",
	}),

	// Feature stuff
	feature_id: z.string().nullish().meta({
		description:
			"The feature ID of the product item. Should be null for fixed price items.",
	}),

	feature_type: z.enum(ProductItemFeatureType).nullish().meta({
		internal: true,
	}),

	feature: ApiFeatureV0Schema.nullish().meta({
		internal: true,
	}),

	included_usage: z
		.union([z.number(), z.literal(Infinite)])
		.nullish()
		.meta({
			description:
				"The amount of usage included for this feature (per interval).",
		}),

	interval: z
		.preprocess((val) => {
			if (val === "") {
				throw new Error("Interval cannot be empty.");
			}
			return val;
		}, z.enum(ProductItemInterval).nullish())
		.meta({
			description:
				"The reset or billing interval of the product item. If null, feature will have no reset date, and if there's a price, it will be billed one-off.",
		}),

	interval_count: z.number().nullish().meta({
		description: "Interval count of the feature.",
	}),

	entity_feature_id: z.string().nullish().meta({
		description:
			"The feature ID of the entity (like seats) to track sub-balances for.",
	}),

	// Price config
	usage_model: z.enum(UsageModel).nullish().meta({
		description:
			"Whether the feature should be prepaid upfront or billed for how much they use end of billing period.",
	}),

	price: z.number().nullish().meta({
		description:
			"The price of the product item. Should be null if tiered pricing is set.",
	}),

	tiers: z.array(PriceTierSchema).nullish().meta({
		description:
			"Tiered pricing for the product item. Not applicable for fixed price items.",
	}),

	billing_units: z.number().nullish().meta({
		description:
			"The billing units of the product item (eg $1 for 30 credits).",
	}),

	tier_behaviour: z.enum(TierBehaviours).nullish().meta({
		description: "The type of tiered pricing: graduated or volume-based.",
	}),

	// Others
	// carry_over_usage: z.boolean().nullish(),
	reset_usage_when_enabled: z.boolean().nullish().meta({
		description:
			"Whether the usage should be reset when the product is enabled.",
	}),

	display: z
		.object({
			primary_text: z.string(),
			secondary_text: z.string().nullish(),
		})
		.nullish()
		.meta({
			internal: true,
		}),

	// Hidden from users for now.
	usage_limit: z.number().nullish().meta({
		internal: true,
	}),

	config: ProductItemConfigSchema.nullish().meta({
		internal: true,
	}),

	// Stored in backend
	created_at: z.number().nullish().meta({
		internal: true,
	}),
	entitlement_id: z.string().nullish().meta({
		internal: true,
	}),
	price_id: z.string().nullish().meta({
		internal: true,
	}),
	price_config: z.any().nullish().meta({
		internal: true,
	}),
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
