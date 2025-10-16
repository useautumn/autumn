import { ApiProductItemSchema } from "@api/products/planFeature/previousVersions/apiProductItem.js";
import { z } from "zod/v4";

export const ApiCusProductSchema = z
	.object({
		id: z.string().meta({
			description: "The unique identifier for the product",
			example: "pro_plan",
		}),
		name: z.string().nullable().meta({
			description: "The name of the product",
			example: "Pro Plan",
		}),
		group: z.string().nullable().meta({
			description: "The group the product belongs to",
			example: "product_set_1",
		}),
		status: z
			.enum(["active", "expired", "scheduled", "trialing", "past_due"])
			.meta({
				description: "Current status of the product for this customer",
				example: "active",
			}),
		canceled_at: z.number().nullish().meta({
			description: "Timestamp when the product was canceled for the customer",
			example: 1717000000,
		}),
		started_at: z.number().meta({
			description: "Timestamp when the customer started this product",
			example: 1700000000000,
		}),
		is_default: z.boolean().meta({
			description: "Whether this product is the default for the customer",
			example: true,
		}),
		is_add_on: z.boolean().meta({
			description: "Whether the product is an add-on",
			example: false,
		}),
		version: z.number().nullish().meta({
			description: "Version of the product",
			example: 1,
		}),
		stripe_subscription_ids: z
			.array(z.string())
			.nullish()
			.meta({
				description:
					"List of Stripe subscription IDs associated with this product, if any",
				example: ["sub_1Nc0JzBAbcxyz", "sub_1Nc0xyBAnopq"],
			}),
		current_period_start: z.number().nullish().meta({
			description: "Start of the current billing period",
			example: 1717000000,
		}),
		current_period_end: z.number().nullish().meta({
			description: "End of the current billing period",
			example: 1719600000,
		}),
		entity_id: z.string().nullish().meta({
			description:
				"ID of the entity this customer product is attached to, if applicable",
			example: "entity_1234abcd",
		}),
		items: z
			.array(ApiProductItemSchema)
			.nullish()
			.meta({
				description: "Array of product items defining the features and pricing",
				example: [
					{
						feature_id: "<string>",
						feature_type: "single_use",
						included_usage: 123,
						interval: "month",
						usage_model: "prepaid",
						price: 123,
						billing_units: 1000,
						entity_feature_id: "<string>",
						reset_usage_when_enabled: true,
						tiers: [
							{
								to: 100,
								amount: 10,
							},
						],
					},
				],
			}),
		quantity: z.number().optional().meta({
			description:
				"The number of units of this product held by the customer, if applicable",
			example: 1,
		}),
	})
	.meta({
		id: "CustomerProduct",
		description: "Customer product object returned by the API",
	});

export type ApiCusProduct = z.infer<typeof ApiCusProductSchema>;
