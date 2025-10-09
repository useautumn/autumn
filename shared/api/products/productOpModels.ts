import { CreateFreeTrialSchema } from "@models/productModels/freeTrialModels/freeTrialModels.js";
import { ProductItemSchema } from "@models/productV2Models/productItemModels/productItemModels.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";

export const CreateProductItemParamsSchema = ProductItemSchema;

// Base product params

export const CreateProductV2ParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex),

	name: z.string().refine((val) => val.length > 0, {
		message: "name must be a non-empty string",
	}),

	is_add_on: z.boolean().default(false),
	is_default: z.boolean().default(false),
	version: z.number().optional(),
	group: z.string().default(""),

	items: z.array(CreateProductItemParamsSchema).optional(),
	free_trial: CreateFreeTrialSchema.nullish().default(null),
});

export const UpdateProductV2ParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex).optional(),
	name: z
		.string()
		.refine((val) => val.length > 0, {
			message: "name must be a non-empty string",
		})
		.optional(),

	is_add_on: z.boolean().optional(),
	is_default: z.boolean().optional(),
	version: z.number().optional(),
	group: z.string().nullish(),
	archived: z.boolean().optional(),

	items: z.array(CreateProductItemParamsSchema).optional(),
	free_trial: CreateFreeTrialSchema.nullish(),
});

export const UpdateProductQuerySchema = z.object({
	version: z.string().optional(),
	upsert: z.string().optional(),
	disable_version: z.string().optional(),
});

export type CreateProductV2Params = z.infer<typeof CreateProductV2ParamsSchema>;
export type UpdateProductV2Params = z.infer<typeof UpdateProductV2ParamsSchema>;
