import { APICusFeatureSchema } from "@api/customers/components/apiCusFeature.js";
import { APICusProductSchema } from "@api/customers/components/apiCusProduct.js";
import { APIInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";

export const BaseEntitySchema = z
	.object({
		id: z.string().nullable(),
		name: z.string().nullable(),
		customer_id: z.string(),
		feature_id: z.string().nullish(),
		created_at: z.number(),
		env: z.enum(AppEnv),
	})
	.meta({
		id: "CustomerEntity",
		description: "Base entity object returned by the API",
	});

export const APIEntitySchema = z
	.object({
		...BaseEntitySchema.shape,

		products: z.array(APICusProductSchema),
		features: z.record(z.string(), APICusFeatureSchema),
		invoices: z.array(APIInvoiceSchema).optional(),
	})
	.meta({
		id: "Entity",
		description: "Entity object with features and products returned by the API",
	});

export type APIEntity = z.infer<typeof APIEntitySchema>;
