import { APICusFeatureSchema } from "@api/customers/components/apiCusFeature.js";
import { APICusProductSchema } from "@api/customers/components/apiCusProduct.js";
import { APIInvoiceSchema } from "@api/others/apiInvoice.js";
import { z } from "zod/v4";
import { AppEnv } from "../../genModels/genEnums.js";

export const EntityResponseSchema = z.object({
	id: z.string().nullable(),
	name: z.string().nullable(),
	customer_id: z.string(),
	feature_id: z.string().nullish(),

	created_at: z.number(),
	env: z.enum(AppEnv),
	products: z.array(APICusProductSchema).optional(),
	features: z.record(z.string(), APICusFeatureSchema).optional(),
	invoices: z.array(APIInvoiceSchema).optional(),
});

export type EntityResponse = z.infer<typeof EntityResponseSchema>;
