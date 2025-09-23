import { z } from "zod";
import { AppEnv } from "../../genModels/genEnums.js";
import { CusEntResponseV2Schema } from "../cusResModels/cusFeatureResponse.js";
import { CusProductResponseSchema } from "../cusResModels/cusProductResponse.js";
import { InvoiceResponseSchema } from "../invoiceModels/invoiceResponseModels.js";

export const EntityResponseSchema = z.object({
	id: z.string().nullable(),
	name: z.string().nullable(),
	customer_id: z.string(),
	feature_id: z.string().nullish(),

	created_at: z.number(),
	env: z.nativeEnum(AppEnv),
	products: z.array(CusProductResponseSchema).optional(),
	features: z.record(z.string(), CusEntResponseV2Schema).optional(),
	invoices: z.array(InvoiceResponseSchema).optional(),
});

export type EntityResponse = z.infer<typeof EntityResponseSchema>;
