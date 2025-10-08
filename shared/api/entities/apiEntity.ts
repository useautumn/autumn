import { ApiCusFeatureSchema } from "@api/customers/cusFeatures/apiCusFeature.js";
import { ApiCusProductSchema } from "@api/customers/cusProducts/apiCusProduct.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";

export const ApiBaseEntitySchema = z.object({
	id: z.string().nullable(),
	name: z.string().nullable(),

	customer_id: z.string().nullish(),
	feature_id: z.string().nullish(),

	created_at: z.number(),
	env: z.enum(AppEnv),
});

export const ApiEntitySchema = ApiBaseEntitySchema.extend({
	products: z.array(ApiCusProductSchema).optional(),
	features: z.record(z.string(), ApiCusFeatureSchema).optional(),
	invoices: z.array(ApiInvoiceSchema).optional(),
});

export type EntityResponse = z.infer<typeof ApiEntitySchema>;
