import { z } from "zod";
import { AttachScenario } from "../checkModels/checkPreviewModels.js";
import { AppEnv } from "../genModels/genEnums.js";
import { FreeTrialResponseSchema } from "../productModels/freeTrialModels/freeTrialModels.js";
import { ProductItemResponseSchema } from "./productItemModels/prodItemResponseModels.js";

export const ProductPropertiesSchema = z.object({
	is_free: z.boolean(),
	is_one_off: z.boolean(),
	interval_group: z.string().nullish(),
	has_trial: z.boolean().nullish(),
	updateable: z.boolean().nullish(),
});

export const ProductResponseSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	group: z.string().nullable(),
	env: z.nativeEnum(AppEnv),
	is_add_on: z.boolean(),
	is_default: z.boolean(),
	version: z.number(),
	created_at: z.number(),

	items: z.array(ProductItemResponseSchema),
	free_trial: FreeTrialResponseSchema.nullable(),
	base_variant_id: z.string().nullable(),

	scenario: z.nativeEnum(AttachScenario).optional(),
	properties: ProductPropertiesSchema.optional(),
	archived: z.boolean().optional(),
});

export type ProductResponse = z.infer<typeof ProductResponseSchema>;
export type ProductProperties = z.infer<typeof ProductPropertiesSchema>;
