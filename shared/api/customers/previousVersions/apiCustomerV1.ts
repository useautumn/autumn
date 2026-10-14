import { ApiCusFeatureV1Schema } from "@api/customers/cusFeatures/previousVersions/apiCusFeatureV1";
import { ApiInvoiceV0Schema } from "@api/others/apiInvoice/prevVersions/apiInvoiceV0";
import { AppEnv } from "@models/genModels/genEnums";
import { z } from "zod/v4";
import { ApiTrialsUsedV0Schema } from "../components/apiTrialsUsed/prevVersions/apiTrialsUsedV0";
import { ApiCusProductV1Schema } from "../cusPlans/previousVersions/apiCusProductV1";

const ApiCustomerV1CoreSchema = z.object({
	id: z.string().nullable(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	fingerprint: z.string().nullable(),
	internal_id: z.string(),
	created_at: z.number(),
	env: z.enum(AppEnv),

	processor: z
		.object({
			id: z.string(),
			type: z.string(),
		})
		.nullish(),

	metadata: z.record(z.any(), z.any()).default({}),
});

export const ApiCustomerV1Schema = z.object({
	customer: ApiCustomerV1CoreSchema,
	products: z.array(ApiCusProductV1Schema),
	add_ons: z.array(ApiCusProductV1Schema),
	entitlements: z.array(ApiCusFeatureV1Schema),
	invoices: z.array(ApiInvoiceV0Schema),
	trials_used: z.array(ApiTrialsUsedV0Schema).optional(),
	payment_method: z.any().nullish(),
});

export type ApiCustomerV1 = z.infer<typeof ApiCustomerV1Schema>;
type ApiCustomerV1Core = z.infer<typeof ApiCustomerV1CoreSchema>;
