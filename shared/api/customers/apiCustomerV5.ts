import { z } from "zod/v4";
import { ApiCustomerLicenseV0Schema } from "../licenses/apiCustomerLicense";
import { ApiCusExpandSchema } from "./apiCustomer";
import { BaseApiCustomerSchema } from "./baseApiCustomer";
import { ApiBalanceV1Schema } from "./cusFeatures/apiBalanceV1";
import {
	ApiPurchaseV0Schema,
	ApiSubscriptionV1Schema,
} from "./cusPlans/apiSubscriptionV1";
import { ApiCusProcessorsSchema } from "./cusProcessors/apiCusProcessors";
import { ApiFlagV0Schema } from "./flags/apiFlagV0";

export const API_CUSTOMER_V5_EXAMPLE = {
	id: "2ee25a41-0d81-4ad2-8451-ec1aadaefe58", // Example UUID
	name: "Patrick", // Example random name
	email: "patrick@useautumn.com",
	createdAt: 1771409161016,
	fingerprint: null,
	stripeId: "cus_U0BKxpq1mFhuJO",
	processors: {
		stripe: { id: "cus_U0BKxpq1mFhuJO" },
	},
	env: "sandbox",
	metadata: {},
	sendEmailReceipts: false,
	billingControls: {
		autoTopups: [],
	},
	subscriptions: [
		{
			planId: "pro_plan",
			autoEnable: true,
			addOn: false,
			status: "active",
			pastDue: false,
			canceledAt: null,
			expiresAt: null,
			trialEndsAt: null,
			startedAt: 1771431921437,
			currentPeriodStart: 1771431921437,
			currentPeriodEnd: 1771999921437,
			quantity: 1,
		},
	],
	purchases: [],
	licenses: [],
	balances: {
		messages: {
			featureId: "messages",
			granted: 100,
			remaining: 0,
			usage: 100,
			unlimited: false,
			overageAllowed: false,
			maxPurchase: null,
			nextResetAt: 1773851121437,
			breakdown: [
				{
					id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
					planId: "pro_plan",
					includedGrant: 100,
					prepaidGrant: 0,
					remaining: 0,
					usage: 100,
					unlimited: false,
					reset: {
						interval: "month",
						resetsAt: 1773851121437,
					},
					price: null,
					expiresAt: null,
				},
			],
		},
	},
	flags: {
		advanced_workflows: {
			id: "cus_ent_abc123",
			plan_id: "pro_plan",
			expires_at: null,
			feature_id: "advanced_workflows",
		},
	},
	config: {
		disable_pooled_balance: false,
		disable_overage_billing: false,
	},
};

// V5 base customer - uses V1 subscriptions (single array with status field) and V1 balances
export const BaseApiCustomerV5Schema = BaseApiCustomerSchema.extend({
	subscriptions: z.array(ApiSubscriptionV1Schema).meta({
		description:
			"Active and scheduled recurring plans that this customer has attached.",
	}),
	purchases: z.array(ApiPurchaseV0Schema).meta({
		description: "One-time purchases made by the customer.",
	}),
	licenses: z.array(ApiCustomerLicenseV0Schema).meta({
		description:
			"License seat pools granted by the customer's plans, with seat counts.",
	}),
	balances: z.record(z.string(), ApiBalanceV1Schema).meta({
		description:
			"Feature balances keyed by feature ID, showing usage limits and remaining amounts.",
	}),
	flags: z.record(z.string(), ApiFlagV0Schema).meta({
		description:
			"Boolean feature flags keyed by feature ID, showing enabled access for on/off features.",
	}),
	config: z
		.object({
			disable_pooled_balance: z.boolean().optional().meta({
				description:
					"Whether to disable the shared customer-level pool for entities.",
			}),
			disable_overage_billing: z.boolean().optional().meta({
				description:
					"Stops Autumn from posting usage-overage line items to Stripe for this customer. Check/track and balance resets still behave normally. When set, this overrides the organization-level disable_overage_billing setting.",
			}),
		})
		.optional()
		.meta({
			description: "Configuration for the customer.",
		}),
	processors: ApiCusProcessorsSchema.optional().meta({
		description:
			"Payment processors this customer is connected to (Stripe, Vercel, RevenueCat). Omitted entirely when the customer has not been created in any processor.",
	}),
}).meta({
	examples: [API_CUSTOMER_V5_EXAMPLE],
});

export const ApiCustomerV5Schema = BaseApiCustomerV5Schema.extend(
	ApiCusExpandSchema.shape,
).meta({
	examples: [API_CUSTOMER_V5_EXAMPLE],
});

export type ApiCustomerV5 = z.infer<typeof ApiCustomerV5Schema>;
export type BaseApiCustomerV5 = z.infer<typeof BaseApiCustomerV5Schema>;
