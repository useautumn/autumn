import { ApiBaseEntitySchema } from "@api/entities/apiEntity.js";
import { ApiCusRewardsSchema } from "@api/others/apiDiscount.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiCusReferralSchema } from "./components/apiCusReferral.js";
import { ApiCusUpcomingInvoiceSchema } from "./components/apiCusUpcomingInvoice.js";
import { ApiCusFeatureSchema } from "./cusFeatures/apiCusFeature.js";
import { ApiCusPlanSchema } from "./cusPlans/apiCusPlan.js";

export const ApiTrialsUsedSchema = z.object({
	product_id: z.string(),
	customer_id: z.string(),
	fingerprint: z.string().nullish(),
});

export const ApiCusExpandSchema = z.object({
	invoices: z.array(ApiInvoiceSchema).optional(),
	entities: z.array(ApiBaseEntitySchema).optional(),
	trials_used: z.array(ApiTrialsUsedSchema).optional(),
	rewards: ApiCusRewardsSchema.nullish(),
	referrals: z.array(ApiCusReferralSchema).optional(),
	upcoming_invoice: ApiCusUpcomingInvoiceSchema.nullish(),
	payment_method: z.any().nullish(),
});

export const ApiCustomerSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	created_at: z.number(),
	fingerprint: z.string().nullable(),
	stripe_id: z.string().nullable(),
	env: z.enum(AppEnv),
	metadata: z.record(z.any(), z.any()),

	plans: z.array(ApiCusPlanSchema),

	features: z.record(z.string(), ApiCusFeatureSchema),
	...ApiCusExpandSchema.shape,
});

export type ApiCustomer = z.infer<typeof ApiCustomerSchema>;
export type ApiCusExpand = z.infer<typeof ApiCusExpandSchema>;
