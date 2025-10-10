import { ApiFeatureSchema } from "@api/features/apiFeature.js";
import { Infinite } from "@models/productModels/productEnums.js";
import {
	PriceTierSchema,
	ProductItemFeatureType,
	ProductItemInterval,
	ProductItemType,
	UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";

export const ApiProductItemSchema = z.object({
	// Feature stuff
	type: z.enum(ProductItemType).nullish().meta({
		description: "The type of the product item",
		example: "<string>",
	}),
	feature_id: z.string().nullish().meta({
		description:
			"The feature ID of the product item. Should be `null` for prices.",
		example: "<string>",
	}),
	feature_type: z.enum(ProductItemFeatureType).nullish().meta({
		description:
			"Single use features are used once and then depleted, like API calls or credits. Continuous use features are those being used on an ongoing-basis, like storage or seats.",
		example: "<string>",
	}),

	// Feature response
	feature: ApiFeatureSchema.nullish().meta({
		description: "The feature itself",
		example: {
			id: "<string>",
			name: "<string>",
		},
	}),

	included_usage: z.number().or(z.literal(Infinite)).nullish().meta({
		description: "The amount of usage included for this feature.",
		example: 123,
	}),
	interval: z.enum(ProductItemInterval).nullish().meta({
		description:
			"The reset or billing interval of the product item. If null, feature will have no reset date, and if there's a price, it will be billed one-off.",
		example: "<string>",
	}),
	interval_count: z.number().nullish().meta({
		description: "The number of intervals between resets",
		example: 123,
	}),

	// Price config
	price: z.number().nullish().meta({
		description:
			"The price of the product item. Should be `null` if tiered pricing is set.",
		example: 123,
	}),
	tiers: z
		.array(PriceTierSchema)
		.nullish()
		.meta({
			description: "Tiered pricing for the product item.",
			example: [
				{ to: 100, amount: 10 },
				{ to: 200, amount: 20 },
			],
		}),
	usage_model: z.enum(UsageModel).nullish().meta({
		description:
			"Whether the feature should be prepaid upfront or billed for how much they use end of billing period.",
		example: "<string>",
	}),
	billing_units: z.number().nullish().meta({
		description: "The amount per billing unit (eg. $9 / 250 units)",
		example: 250,
	}),
	reset_usage_when_enabled: z.boolean().nullish().meta({
		description:
			"Whether the usage should be reset when the product is enabled.",
	}),
	quantity: z.number().nullish(),
	next_cycle_quantity: z.number().nullish(),
	entity_feature_id: z.string().nullish().meta({
		description: "The entity feature ID of the product item if applicable.",
		example: "<string>",
	}),

	display: z
		.object({
			primary_text: z.string(),
			secondary_text: z.string().nullish(),
		})
		.nullish()
		.meta({
			description: "The display of the product item.",
			example: { primary_text: "<string>", secondary_text: "<string>" },
		}),
});

export type ApiProductItem = z.infer<typeof ApiProductItemSchema>;
