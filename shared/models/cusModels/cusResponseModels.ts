import { z } from "zod/v4";

import { AppEnv } from "../genModels/genEnums.js";
import { RewardResponseSchema } from "../rewardModels/rewardModels/rewardResponseModels.js";
import { CusProductResponseSchema } from "./cusResModels/cusProductResponse.js";
import { CusReferralResponseSchema } from "./cusResModels/cusReferralsResponse.js";
import { UpcomingInvoiceResponseSchema } from "./cusResModels/upcomingInvoiceResponse.js";
import { EntityResponseSchema } from "./entityModels/entityResModels.js";
import { InvoiceResponseSchema } from "./invoiceModels/invoiceResponseModels.js";

export const TrialUsedResponseSchema = z.object({
	product_id: z.string(),
	customer_id: z.string(),
	fingerprint: z.string().nullish(),
});

export const CusResponseSchema = z.object({
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
	env: z.nativeEnum(AppEnv),

	products: z.array(CusProductResponseSchema),
	features: z.any(),

	invoices: z.array(InvoiceResponseSchema).optional(),
	trials_used: z.array(TrialUsedResponseSchema).optional(),
	rewards: RewardResponseSchema.nullish(),
	metadata: z.record(z.any(), z.any()).default({}),
	entities: z.array(EntityResponseSchema).optional(),
	referrals: z.array(CusReferralResponseSchema).optional(),
	payment_method: z.any().nullish(),
	upcoming_invoice: UpcomingInvoiceResponseSchema.nullish(),
});

export type CusResponse = z.infer<typeof CusResponseSchema>;
export type CusProductResponse = z.infer<typeof CusProductResponseSchema>;
