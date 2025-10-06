import { APICusProductSchema } from "@api/customers/components/apiCusProduct.js";
import { APICusReferralSchema } from "@api/customers/components/apiCusReferral.js";
import { ApiCusFeatureSchema } from "@api/customers/cusFeatures/apiCusFeature.js";
import { APICusRewardsSchema } from "@api/models.js";
import { APIInvoiceSchema } from "@api/others/apiInvoice.js";
import { EntityResponseSchema } from "@models/cusModels/entityModels/entityResModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { APICusUpcomingInvoiceSchema } from "./components/apiCusUpcomingInvoice.js";

export const APITrialsUsedSchema = z.object({
	product_id: z.string(),
	customer_id: z.string(),
	fingerprint: z.string().nullish(),
});

export const ApiCustomerSchema = z.object({
	// Internal fields
	autumn_id: z.string().nullish(),

	id: z.string().nullable().meta({
		description: "Your internal ID for the customer",
		example: "cus_123",
	}),

	created_at: z.number().meta({
		description:
			"The date and time the customer was created in milliseconds since epoch",
		example: 1717000000,
	}),

	name: z.string().nullable(),
	email: z.string().nullable(),
	fingerprint: z.string().nullable(),
	stripe_id: z.string().nullable().default(null),
	env: z.enum(AppEnv),

	products: z.array(APICusProductSchema),
	features: z.record(z.string(), ApiCusFeatureSchema),
	invoices: z.array(APIInvoiceSchema).optional(),
	trials_used: z.array(APITrialsUsedSchema).optional(),

	rewards: APICusRewardsSchema.nullish(),
	metadata: z.record(z.any(), z.any()).default({}),
	entities: z.array(EntityResponseSchema).optional(),
	referrals: z.array(APICusReferralSchema).optional(),
	upcoming_invoice: APICusUpcomingInvoiceSchema.nullish(),
	payment_method: z.any().nullish(),
});

export type ApiCustomer = z.infer<typeof ApiCustomerSchema>;
