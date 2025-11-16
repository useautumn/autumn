import { ApiBaseEntitySchema } from "@api/entities/apiBaseEntity.js";
import { ApiCusRewardsSchema } from "@api/others/apiDiscount.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiCusReferralSchema } from "./components/apiCusReferral.js";
import { ApiCusUpcomingInvoiceSchema } from "./components/apiCusUpcomingInvoice.js";
import { ApiTrialsUsedSchema } from "./components/apiTrialsUsed.js";
import { ApiBalanceSchema } from "./cusFeatures/apiBalance.js";
import { ApiSubscriptionSchema } from "./cusPlans/apiSubscription.js";

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
	balances: z.record(z.string(), ApiBalanceSchema),
	...ApiCusExpandSchema.shape,
});

export type ApiCustomer = z.infer<typeof ApiCustomerSchema>;
export type ApiCusExpand = z.infer<typeof ApiCusExpandSchema>;
