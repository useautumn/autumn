import { ApiCusFeatureV3Schema } from "@api/customers/cusFeatures/previousVersions/apiCusFeatureV3.js";
import { ApiCusProductV3Schema } from "@api/customers/cusPlans/previousVersions/apiCusProductV3.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";

export const ApiEntityV0Schema = z.object({
	autumn_id: z.string().optional(),
	id: z.string().nullable(),
	name: z.string().nullable(),
	customer_id: z.string().nullish(),
	feature_id: z.string().nullish(),
	created_at: z.number(),
	env: z.enum(AppEnv),

	// V1.2 format: products and features (not subscriptions and balances)
	products: z.array(ApiCusProductV3Schema).optional(),
	features: z.record(z.string(), ApiCusFeatureV3Schema).optional(),
	invoices: z.array(ApiInvoiceSchema).optional(),
});

export type ApiEntityV0 = z.infer<typeof ApiEntityV0Schema>;
