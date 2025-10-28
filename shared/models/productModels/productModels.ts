import { z } from "zod/v4";
import { FeatureSchema } from "../featureModels/featureModels.js";
import { AppEnv } from "../genModels/genEnums.js";
import { EntitlementSchema } from "./entModels/entModels.js";
import { FreeTrialSchema } from "./freeTrialModels/freeTrialModels.js";
import { PriceSchema } from "./priceModels/priceModels.js";

export const ProductSchema = z.object({
	id: z.string(),
	name: z.string().min(1, "Product name cannot be empty"),
	description: z.string().nullable(),
	is_add_on: z.boolean(),
	is_default: z.boolean(),
	version: z.number(),
	group: z.string(),

	env: z.enum(AppEnv),
	internal_id: z.string(),
	org_id: z.string(),
	created_at: z.number(),

	processor: z
		.object({
			type: z.string(),
			id: z.string(),
		})
		.nullish(),
	base_variant_id: z.string().nullable(),
	archived: z.boolean().default(false),
});

export const CreateProductSchema = z.object({
	id: z.string(),
	name: z
		.string()
		.min(1, "Product name cannot be empty")
		.default("Untitled Product"),
	is_add_on: z.boolean().default(false),
	is_default: z.boolean().default(false),
	version: z.number().optional().default(1),
	group: z.string().optional().default(""),
});

export const UpdateProductSchema = z.object({
	id: z.string().nullish(),
	name: z.string().min(1, "Product name cannot be empty").optional(),
	is_add_on: z.boolean().optional(),
	is_default: z.boolean().optional(),
	group: z.string().nullish(),
	archived: z.boolean().optional(),
});

export const FullProductSchema = ProductSchema.extend({
	description: z.string().nullable().optional().default(null),
	prices: z.array(PriceSchema),
	entitlements: z.array(EntitlementSchema.extend({ feature: FeatureSchema })),
	free_trial: FreeTrialSchema.nullish(),
	free_trials: z.array(FreeTrialSchema).nullish(),
	free_trial_ids: z.array(z.string()).nullish(),
});

export type ProductCounts = {
	active: number;
	canceled: number;
	custom: number;
	trialing: number;
	all: number;
};

export type Product = z.infer<typeof ProductSchema>;
export type FullProduct = z.infer<typeof FullProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
