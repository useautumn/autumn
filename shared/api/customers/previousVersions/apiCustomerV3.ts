import { ApiCusReferralSchema } from "@api/customers/components/apiCusReferral.js";
import { ApiCusUpcomingInvoiceSchema } from "@api/customers/components/apiCusUpcomingInvoice.js";
import { ApiBaseEntitySchema } from "@api/entities/apiEntity.js";
import { ApiCusRewardsSchema } from "@api/others/apiDiscount.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiInvoiceV0Schema } from "../../others/apiInvoice/prevVersions/apiInvoiceV0.js";
import { ApiTrialsUsedV0Schema } from "../components/apiTrialsUsed/prevVersions/apiTrialsUsedV0.js";
import { ApiCusFeatureV3Schema } from "../cusFeatures/previousVersions/apiCusFeatureV3.js";
import { ApiCusProductV3Schema } from "../cusPlans/previousVersions/apiCusProductV3.js";

export const API_CUSTOMER_V3_EXAMPLE = {
	id: "customer_123",
	created_at: 1762971906762,
	name: "John Doe",
	email: "john@doe.com",
	fingerprint: null,
	stripe_id: "cus_J8A5c31A8tlpwN",
	env: "sandbox",
	metadata: {},
	products: [
		{
			id: "pro_plan",
			name: "Pro Plan",
			group: "product_set_1",
			status: "active",
			canceled_at: null,
			started_at: 1762971923843,
			is_default: false,
			is_add_on: false,
			version: 1,
			current_period_start: 1762971905000,
			current_period_end: 1765563905000,
			items: [
				{
					type: "feature",
					feature_id: "dashboard",
					feature_type: "static",
					included_usage: 0,
					interval: null,
					entity_feature_id: null,
					display: {
						primary_text: "Dashboard",
					},
				},
				{
					type: "feature",
					feature_id: "messages",
					feature_type: "single_use",
					included_usage: 30,
					interval: "month",
					reset_usage_when_enabled: true,
					entity_feature_id: null,
					display: {
						primary_text: "10 Messages",
					},
				},
			],
			quantity: 1,
		},
	],
	features: {
		messages: {
			id: "messages",
			type: "single_use",
			name: "Messages",
			interval: "month",
			interval_count: 1,
			unlimited: false,
			balance: 10,
			usage: 0,
			included_usage: 10,
			next_reset_at: 1765563905000,
			overage_allowed: false,
		},
		dashboard: {
			id: "dashboard",
			type: "static",
			name: "Dashboard",
			interval: null,
			interval_count: null,
			unlimited: false,
			balance: 0,
			usage: 0,
			included_usage: 0,
			next_reset_at: null,
			overage_allowed: false,
		},
	},
};

const cusDescriptions = {
	id: "Your unique identifier for the customer.",
	created_at: "Timestamp of customer creation in milliseconds since epoch.",
	name: "The name of the customer.",
	email: "The email address of the customer.",
	fingerprint:
		"A unique identifier (eg. serial number) to de-duplicate customers across devices or browsers. For example: apple device ID.",
	stripe_id: "Stripe customer ID.",
	env: "The environment this customer was created in.",
	metadata: "The metadata for the customer.",
	products: "The products the customer has access to.",
	features:
		"The features a customer has access to as a dictionary of feature IDs to customer feature objects.",

	// Expand
	invoices:
		"The invoices for the customer. Returned only if invoices is provided in the expand parameter.",
	entities:
		"The entities for the customer. Returned only if entities is provided in the expand parameter.",
	trials_used:
		"The trials used for the customer. Returned only if trials_used is provided in the expand parameter.",
	rewards:
		"The rewards for the customer. Returned only if rewards is provided in the expand parameter.",
	referrals:
		"The referrals for the customer. Returned only if referrals is provided in the expand parameter.",
	upcoming_invoice:
		"The upcoming invoice for the customer. Returned only if upcoming_invoice is provided in the expand parameter.",
	payment_method:
		"The payment method for the customer on Stripe. Returned only if payment_method is provided in the expand parameter.",
};

export const ApiCusExpandV3Schema = z.object({
	invoices: z.array(ApiInvoiceV0Schema).optional().meta({
		description: cusDescriptions.invoices,
	}),
	entities: z.array(ApiBaseEntitySchema).optional().meta({
		description: cusDescriptions.entities,
	}),
	trials_used: z.array(ApiTrialsUsedV0Schema).optional().meta({
		description: cusDescriptions.trials_used,
	}),
	rewards: ApiCusRewardsSchema.nullish().meta({
		description: cusDescriptions.rewards,
	}),
	referrals: z.array(ApiCusReferralSchema).optional().meta({
		description: cusDescriptions.referrals,
	}),
	upcoming_invoice: ApiCusUpcomingInvoiceSchema.nullish().meta({
		description: cusDescriptions.upcoming_invoice,
	}),
	payment_method: z.any().nullish().meta({
		description: cusDescriptions.payment_method,
	}),
});

export const ApiCustomerV3Schema = z.object({
	// Internal fields
	autumn_id: z.string().nullish().meta({
		internal: true,
	}),
	id: z.string().nullable().meta({
		description: cusDescriptions.id,
	}),
	created_at: z.number().meta({
		description: cusDescriptions.created_at,
	}),
	name: z.string().nullable().meta({
		description: cusDescriptions.name,
	}),
	email: z.string().nullable().meta({
		description: cusDescriptions.email,
	}),
	fingerprint: z.string().nullable().meta({
		description: cusDescriptions.fingerprint,
	}),
	stripe_id: z.string().nullable().default(null).meta({
		description: cusDescriptions.stripe_id,
	}),
	env: z.enum(AppEnv).meta({
		description: cusDescriptions.env,
	}),
	metadata: z.record(z.any(), z.any()).default({}).meta({
		description: cusDescriptions.metadata,
	}),
	products: z.array(ApiCusProductV3Schema).meta({
		description: cusDescriptions.products,
	}),
	features: z.record(z.string(), ApiCusFeatureV3Schema).meta({
		description: cusDescriptions.features,
	}),
	...ApiCusExpandV3Schema.shape,
});

export type ApiCustomerV3 = z.infer<typeof ApiCustomerV3Schema>;
export type ApiCustomerV3Expand = z.infer<typeof ApiCusExpandV3Schema>;
