import { ApiBaseEntitySchema } from "@api/entities/apiBaseEntity";
import { ApiCusRewardsSchema } from "@api/others/apiDiscount";
import { ApiInvoiceV1Schema } from "@api/others/apiInvoice/apiInvoiceV1";
import { z } from "zod/v4";
import { BaseApiCustomerSchema } from "./baseApiCustomer";
import { ApiCusReferralSchema } from "./components/apiCusReferral";
import { ApiTrialsUsedV1Schema } from "./components/apiTrialsUsed/apiTrialsUsedV1";
import { ApiBalanceSchema } from "./cusFeatures/apiBalance";
import { ApiSubscriptionSchema } from "./cusPlans/apiSubscription";

export {
	type BaseApiCustomer,
	BaseApiCustomerSchema,
} from "./baseApiCustomer";

export const ApiCusExpandSchema = z.object({
	invoices: z.array(ApiInvoiceV1Schema).optional().meta({
		description: "Invoices for this customer.",
	}),
	entities: z.array(ApiBaseEntitySchema).optional().meta({
		description: "Entities associated with this customer.",
	}),
	trials_used: z.array(ApiTrialsUsedV1Schema).optional().meta({
		description: "Trial usage history for this customer.",
	}),
	rewards: ApiCusRewardsSchema.nullish().meta({
		description: "Rewards earned or applied for this customer.",
	}),
	referrals: z.array(ApiCusReferralSchema).optional().meta({
		description: "Referral records for this customer.",
	}),
	payment_method: z.any().nullish().meta({
		description: "The customer's default payment method.",
	}),
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
