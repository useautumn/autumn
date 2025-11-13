import { CreateFreeTrialSchema } from "@models/productModels/freeTrialModels/freeTrialModels.js";
import { ProductItemSchema } from "@models/productV2Models/productItemModels/productItemModels.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";

// Use the full ProductItemSchema but mark backend fields as internal
export const CreateProductItemParamsSchema = ProductItemSchema.meta({
	id: "CreateProductItemParams",
	description: "Product item defining features and pricing within a product",
});

// Base product params

const CREATE_PRODUCT_EXAMPLE = {
	id: "Pro Product",
	name: "Pro Plan",
	is_add_on: false,
	is_default: false,
	items: [
		{
			// Price
			price: 20,
			interval: "month",
		},
		{
			// Priced Feature
			feature_id: "messages",
			included_usage: 1000,
			price: 0.5,
			interval: "month",
			usage_model: "pay_per_use",
		},
	],
	free_trial: {
		duration: "day",
		length: 7,
		unique_fingerprint: false,
		card_required: true,
	},
};

const descriptions = {
	id: "The ID of the product. Used to identify the product in other API calls like checkout or update product.",
	name: "The name of the product",
	description: "The description of the product",
	is_add_on:
		"Whether the product is an add-on. Add-on products can be attached multiple times and don't to through upgrade / downgrade flows.",
	is_default:
		"Whether the product is the default product. Default products are enabled by default for new customers.",
	group:
		"Product group which this product belongs to. Products within a group have upgrade / downgrade logic when the customer moves between them.",
	items:
		"Array of product items that define the product's features and pricing",
	free_trial: "Free trial configuration for this product, if available",

	// Update only
	archived:
		"Archive this product using this flag. Archived products are hidden on the dashboard.",
};

export const CreateProductV2ParamsSchema = z
	.object({
		id: z.string().nonempty().regex(idRegex).meta({
			description: descriptions.id,
		}),

		name: z
			.string()
			.refine((val) => val.length > 0, {
				message: "name must be a non-empty string",
			})
			.meta({
				description: descriptions.name,
			}),

		description: z.string().nullish().meta({
			description: descriptions.description,
		}),

		is_add_on: z.boolean().default(false).meta({
			description: descriptions.is_add_on,
		}),

		is_default: z.boolean().default(false).meta({
			description: descriptions.is_default,
		}),

		group: z.string().nullable().default("").meta({
			description: descriptions.group,
		}),

		items: z.array(CreateProductItemParamsSchema).optional().meta({
			description: descriptions.items,
		}),

		free_trial: CreateFreeTrialSchema.nullish().default(null).meta({
			description: descriptions.free_trial,
		}),
	})
	.meta({
		examples: [CREATE_PRODUCT_EXAMPLE],
	});

export const UpdateProductV2ParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex).optional().meta({
		description: descriptions.id,
	}),
	name: z
		.string()
		.refine((val) => val.length > 0, {
			message: "name must be a non-empty string",
		})
		.optional()
		.meta({
			description: descriptions.name,
		}),

	is_add_on: z.boolean().optional().meta({
		description: descriptions.is_add_on,
	}),
	is_default: z.boolean().optional().meta({
		description: descriptions.is_default,
	}),

	description: z.string().nullish().optional().meta({
		description: descriptions.description,
	}),
	// version: z.number().optional().meta({
	// 	internal: true,
	// }),
	group: z.string().nonempty().nullable().optional().meta({
		description: descriptions.group,
	}),
	archived: z.boolean().optional().meta({
		description: descriptions.archived,
	}),

	items: z.array(CreateProductItemParamsSchema).optional(),
	free_trial: CreateFreeTrialSchema.nullish().meta({
		description: descriptions.free_trial,
	}),
});

export const UpdateProductQuerySchema = z.object({
	version: z.string().optional(),
	upsert: z.boolean().optional(),
	disable_version: z.boolean().optional(),
});

export type CreateProductV2Params = z.infer<typeof CreateProductV2ParamsSchema>;
export type UpdateProductV2Params = z.infer<typeof UpdateProductV2ParamsSchema>;
