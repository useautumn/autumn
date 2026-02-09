import { ApiBaseEntitySchema } from "@api/entities/apiBaseEntity.js";
import { ApiCusRewardsSchema } from "@api/others/apiDiscount.js";
import { ApiInvoiceV1Schema } from "@api/others/apiInvoice/apiInvoiceV1.js";
import { z } from "zod/v4";
import { BaseApiCustomerSchema } from "./baseApiCustomer.js";
import { ApiCusReferralSchema } from "./components/apiCusReferral.js";
import { ApiTrialsUsedV1Schema } from "./components/apiTrialsUsed/apiTrialsUsedV1.js";
import { ApiBalanceSchema } from "./cusFeatures/apiBalance.js";
import { ApiSubscriptionSchema } from "./cusPlans/apiSubscription.js";

export {
	type BaseApiCustomer,
	BaseApiCustomerSchema,
} from "./baseApiCustomer.js";

export const ApiCusExpandSchema = z.object({
	invoices: z.array(ApiInvoiceV1Schema).optional(),
	entities: z.array(ApiBaseEntitySchema).optional(),
	trials_used: z.array(ApiTrialsUsedV1Schema).optional(),
	rewards: ApiCusRewardsSchema.nullish(),
	referrals: z.array(ApiCusReferralSchema).optional(),
	payment_method: z.any().nullish(),
});

// V4 base customer - adds V0 subscriptions and balances
export const BaseApiCustomerV4Schema = BaseApiCustomerSchema.extend({
	subscriptions: z.array(ApiSubscriptionSchema),
	scheduled_subscriptions: z.array(ApiSubscriptionSchema),
	balances: z.record(z.string(), ApiBalanceSchema),
});

export const ApiCustomerSchema = BaseApiCustomerV4Schema.extend(
	ApiCusExpandSchema.shape,
);

export type ApiCustomer = z.infer<typeof ApiCustomerSchema>;
export type ApiCusExpand = z.infer<typeof ApiCusExpandSchema>;
export type BaseApiCustomerV4 = z.infer<typeof BaseApiCustomerV4Schema>;
