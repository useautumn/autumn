import { ApiCusFeatureV3Schema } from "@api/customers/cusFeatures/previousVersions/apiCusFeatureV3.js";
import { ApiCusProductV3Schema } from "@api/customers/cusPlans/previousVersions/apiCusProductV3.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";

export const API_ENTITY_V0_EXAMPLE = {
	id: "seat_123",
	name: "John Doe's Seat",
	customer_id: "org_123",
	created_at: 1762971906762,
	env: AppEnv.Sandbox,
	products: [
		{
			id: "pro_plan",
			name: "Pro Plan",
			group: null,
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
			included_usage: 30,
			next_reset_at: 1765563905000,
			overage_allowed: false,
		},
	},
};

const entityDescriptions = {
	id: "The unique identifier of the entity.",
	name: "The name of the entity.",
	customer_id: "The customer ID this entity belongs to.",
	feature_id: "The feature ID this entity belongs to.",
	created_at: "Unix timestamp (in milliseconds) when the entity was created.",
	env: "The environment (sandbox/live).",
	products: "The products this entity has access to.",
	features: "The features this entity has access to.",
	invoices:
		"The invoices for this entity. Returned only if 'invoices' is passed into the expand parameter.",
};

export const ApiEntityV0Schema = z.object({
	autumn_id: z.string().optional().meta({
		internal: true,
	}),
	id: z.string().nullable().meta({
		description: entityDescriptions.id,
	}),
	name: z.string().nullable().meta({
		description: entityDescriptions.name,
	}),
	customer_id: z.string().nullish().meta({
		description: entityDescriptions.customer_id,
	}),
	feature_id: z.string().nullish().meta({
		description: entityDescriptions.feature_id,
	}),
	created_at: z.number().meta({
		description: entityDescriptions.created_at,
	}),
	env: z.enum(AppEnv),

	// V1.2 format: products and features (not subscriptions and balances)
	products: z.array(ApiCusProductV3Schema).optional().meta({
		description: entityDescriptions.products,
	}),
	features: z.record(z.string(), ApiCusFeatureV3Schema).optional().meta({
		description: entityDescriptions.features,
	}),
	invoices: z.array(ApiInvoiceSchema).optional().meta({
		description: entityDescriptions.invoices,
	}),
});

export type ApiEntityV0 = z.infer<typeof ApiEntityV0Schema>;
