import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { ProductItemResponseSchema } from "@models/productV2Models/productItemModels/prodItemResponseModels.js";
import { z } from "zod/v4";
import { APIFreeTrial } from "./apiFreeTrial.js";
// import { AttachScenario } from "../checkModels/checkPreviewModels.js";
// import { AppEnv } from "../genModels/genEnums.js";
// import { FreeTrialResponseSchema } from "../productModels/freeTrialModels/freeTrialModels.js";
// import { ProductItemResponseSchema } from "./productItemModels/prodItemResponseModels.js";

export const APIProductPropertiesSchema = z.object({
	is_free: z.boolean(),
	is_one_off: z.boolean(),
	interval_group: z.string().nullish(),
	has_trial: z.boolean().nullish(),
	updateable: z.boolean().nullish(),
});

export const APIProductSchema = z.object({
	id: z.string(),
	name: z.string(),
	group: z.string().nullable(),

	env: z.enum(AppEnv),
	is_add_on: z.boolean(),
	is_default: z.boolean(),
	version: z.number(),
	created_at: z.number(),

	items: z.array(ProductItemResponseSchema),
	free_trial: APIFreeTrial.nullable(),
	base_variant_id: z.string().nullable(),

	scenario: z.enum(AttachScenario).optional(),
	properties: APIProductPropertiesSchema.optional(),
	archived: z.boolean().optional(),
});

export type APIProduct = z.infer<typeof APIProductSchema>;
export type APIProductProperties = z.infer<typeof APIProductPropertiesSchema>;
// export type ProductResponse = z.infer<typeof ProductResponseSchema>;
