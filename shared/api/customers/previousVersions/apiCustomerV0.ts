import { ApiCusFeatureV0Schema } from "@api/customers/cusFeatures/previousVersions/apiCusFeatureV0";
import { ApiCusProductV0Schema } from "@api/customers/cusPlans/previousVersions/apiCusProductV0";
import { ApiInvoiceV0Schema } from "@api/others/apiInvoice/prevVersions/apiInvoiceV0";
import { AppEnv } from "@models/genModels/genEnums";
import { z } from "zod/v4";
import { ApiTrialsUsedV0Schema } from "../components/apiTrialsUsed/prevVersions/apiTrialsUsedV0";

const ApiCustomerV0CoreSchema = z.object({
	id: z.string().nullable(),
	name: z.string().default(""),
	email: z.string().default(""),
	fingerprint: z.string().default(""),
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

export const ApiCustomerV0Schema = z.object({
	customer: ApiCustomerV0CoreSchema,
	products: z.array(ApiCusProductV0Schema),
	add_ons: z.array(ApiCusProductV0Schema),
	entitlements: z.array(ApiCusFeatureV0Schema),
	invoices: z.array(ApiInvoiceV0Schema),
	trials_used: z.array(ApiTrialsUsedV0Schema).optional(),
	payment_method: z.any().nullish(),
});

type ApiCustomerV0 = z.infer<typeof ApiCustomerV0Schema>;
type ApiCustomerV0Core = z.infer<typeof ApiCustomerV0CoreSchema>;
