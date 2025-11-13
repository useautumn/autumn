import { ApiProductPropertiesSchema } from "@api/products/previousVersions/apiProduct.js";
import { z } from "zod/v4";
import { AttachScenario } from "../checkModels/checkPreviewModels.js";
import { AppEnv } from "../genModels/genEnums.js";
import { ProductItemInterval } from "../productModels/intervals/productItemInterval.js";

export const PlanResponseSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	description: z.string().nullable(),
	group: z.string().nullable(),
	env: z.nativeEnum(AppEnv),
	is_add_on: z.boolean(),
	is_default: z.boolean(),
	archived: z.boolean().optional(),
	version: z.number(),
	created_at: z.number(),

	price: z
		.object({
			amount: z.number(),
			interval: z.nativeEnum(ProductItemInterval).nullable(),
		})
		.nullable(),

	// features:

	// items: z.array(ProductItemResponseSchema),
	// free_trial: FreeTrialResponseSchema.nullable(),
	// base_variant_id: z.string().nullable(),

	scenario: z.nativeEnum(AttachScenario).optional(),
	properties: ApiProductPropertiesSchema.optional(),
});
