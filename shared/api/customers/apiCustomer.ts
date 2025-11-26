import { ApiBaseEntitySchema } from "@api/entities/apiBaseEntity.js";
import { ApiCusRewardsSchema } from "@api/others/apiDiscount.js";
import { ApiInvoiceV1Schema } from "@api/others/apiInvoice/apiInvoiceV1.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiCusReferralSchema } from "./components/apiCusReferral.js";
import { ApiTrialsUsedV1Schema } from "./components/apiTrialsUsed/apiTrialsUsedV1.js";
// import { ApiCusUpcomingInvoiceSchema } from "./components/apiCusUpcomingInvoice.js";
import { ApiBalanceSchema } from "./cusFeatures/apiBalance.js";
import { ApiSubscriptionSchema } from "./cusPlans/apiSubscription.js";

export const ApiCusExpandSchema = z.object({
	invoices: z.array(ApiInvoiceV1Schema).optional(),
	entities: z.array(ApiBaseEntitySchema).optional(),
	trials_used: z.array(ApiTrialsUsedV1Schema).optional(),
	rewards: ApiCusRewardsSchema.nullish(),
	referrals: z.array(ApiCusReferralSchema).optional(),
	payment_method: z.any().nullish(),
	// upcoming_invoice: ApiCusUpcomingInvoiceSchema.nullish(),
});

export const ApiCustomerSchema = z.object({
	autumn_id: z.string().optional(),
	id: z.string().nullable(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	created_at: z.number(),
	fingerprint: z.string().nullable(),
	stripe_id: z.string().nullable(),
	env: z.enum(AppEnv),
	metadata: z.record(z.any(), z.any()),

	subscriptions: z.array(ApiSubscriptionSchema),

	scheduled_subscriptions: z.array(ApiSubscriptionSchema),

	balances: z.record(z.string(), ApiBalanceSchema),
	...ApiCusExpandSchema.shape,
});

export type ApiCustomer = z.infer<typeof ApiCustomerSchema>;
export type ApiCusExpand = z.infer<typeof ApiCusExpandSchema>;
