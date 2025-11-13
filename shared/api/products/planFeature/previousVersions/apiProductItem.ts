import { ApiFeatureSchema } from "@api/features/apiFeature.js";
import { ProductItemInterval } from "@models/productModels/intervals/productItemInterval.js";
import { Infinite } from "@models/productModels/productEnums.js";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums.js";
import {
	PriceTierSchema,
	ProductItemFeatureType,
	ProductItemType,
	RolloverConfigSchema,
	UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";

export const ApiProductItemSchema = z
	.object({
		// Feature stuff
		type: z
			.enum(ProductItemType)
			.nullish()
			.describe("The type of the product item"),

		feature_id: z
			.string()
			.nullish()
			.describe(
				"The feature ID of the product item. If the item is a fixed price, should be `null`",
			),

		feature_type: z.enum(ProductItemFeatureType).nullish().meta({
			description:
				"Single use features are used once and then depleted, like API calls or credits. Continuous use features are those being used on an ongoing-basis, like storage or seats.",
		}),

		// Feature response
		feature: ApiFeatureSchema.nullish().meta({
			internal: true,
		}),

		included_usage: z.number().or(z.literal(Infinite)).nullish().meta({
			description: "The amount of usage included for this feature.",
		}),

		interval: z.enum(ProductItemInterval).nullish().meta({
			description:
				"The reset or billing interval of the product item. If null, feature will have no reset date, and if there's a price, it will be billed one-off.",
		}),

		interval_count: z.number().nullish().meta({
			description: "The interval count of the product item.",
		}),

		// Price config
		price: z.number().nullish().meta({
			description:
				"The price of the product item. Should be `null` if tiered pricing is set.",
		}),

		tiers: z.array(PriceTierSchema).nullish().meta({
			description:
				"Tiered pricing for the product item. Not applicable for fixed price items.",
		}),

		usage_model: z.enum(UsageModel).nullish().meta({
			description:
				"Whether the feature should be prepaid upfront or billed for how much they use end of billing period.",
		}),

		billing_units: z.number().nullish().meta({
			description: "The amount per billing unit (eg. $9 / 250 units)",
		}),

		reset_usage_when_enabled: z.boolean().nullish().meta({
			description:
				"Whether the usage should be reset when the product is enabled.",
		}),

		entity_feature_id: z.string().nullish().meta({
			description: "The entity feature ID of the product item if applicable.",
		}),

		display: z
			.object({
				primary_text: z.string(),
				secondary_text: z.string().nullish(),
			})
			.nullish()
			.meta({
				description: "The display of the product item.",
			}),

		quantity: z.number().nullish().meta({
			description:
				"Used in customer context. Quantity of the feature the customer has prepaid for.",
		}),

		next_cycle_quantity: z.number().nullish().meta({
			description:
				"Used in customer context. Quantity of the feature the customer will prepay for in the next cycle.",
		}),

		config: z
			.object({
				rollover: RolloverConfigSchema.nullish(),
				on_increase: z.enum(OnIncrease).nullish(),
				on_decrease: z.enum(OnDecrease).nullish(),
			})
			.nullish()
			.meta({
				description:
					"Configuration for rollover and proration behavior of the feature.",
			}),
	})
	.meta({
		id: "ProductItem",
		description: "Product item defining features and pricing within a product",
	});

export type ApiProductItem = z.infer<typeof ApiProductItemSchema>;
