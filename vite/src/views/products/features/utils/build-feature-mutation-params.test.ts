import { expect, test } from "bun:test";
import { FeatureType, FeatureUsageType, Infinite } from "@autumn/shared";
import {
	buildFeatureMarkupParams,
	featureToCatalogFeatureParams,
} from "./buildFeatureMutationParams";

test("classic credit systems preserve graduated rate cards and never send the inert invoice flag", () => {
	const result = buildFeatureMarkupParams({
		type: FeatureType.CreditSystem,
		schema: [
			{
				metered_feature_id: "tokens",
				feature_amount: 100,
				tier_behavior: "graduated",
				tiers: [
					{ to: 10_000, credit_amount: 1 },
					{ to: Infinite, credit_amount: 0.5 },
				],
			},
		],
	});

	expect(result.credit_schema).toEqual([
		{
			metered_feature_id: "tokens",
			billing_units: 100,
			tier_behavior: "graduated",
			tiers: [
				{ to: 10_000, credit_cost: 1 },
				{ to: Infinite, credit_cost: 0.5 },
			],
		},
	]);
	expect(result).not.toHaveProperty("invoice_credit");
});

test("AI credit systems never send classic rate-card fields", () => {
	const result = buildFeatureMarkupParams({
		type: FeatureType.AiCreditSystem,
		modelMarkups: { "openai/gpt-5": { markup: 20 } },
		defaultMarkup: 10,
		providerMarkups: { openai: { markup: 15 } },
		schema: [
			{
				metered_feature_id: "tokens",
				feature_amount: 100,
				credit_amount: 1,
			},
		],
	});

	expect(result.credit_schema).toBeUndefined();
	expect(result.model_markups).toEqual({
		"openai/gpt-5": { markup: 20 },
	});
	expect(result.default_markup).toBe(10);
	expect(result.provider_markups).toEqual({ openai: { markup: 15 } });
});

test("catalog feature params drop a stored invoice_credit flag", () => {
	const result = featureToCatalogFeatureParams({
		feature: {
			id: "credits",
			name: "Credits",
			type: FeatureType.CreditSystem,
			config: {
				usage_type: FeatureUsageType.Single,
				invoice_credit: true,
				schema: [
					{
						metered_feature_id: "tokens",
						feature_amount: 100,
						credit_amount: 1,
					},
				],
			},
			event_names: [],
		},
	});

	expect(result).not.toHaveProperty("invoice_credit");
	expect(result.credit_schema).toEqual([
		{
			metered_feature_id: "tokens",
			billing_units: 100,
			credit_cost: 1,
		},
	]);
	expect(result.processors).toBeUndefined();
});

const creditFeature = {
	id: "credits",
	name: "Credits",
	type: FeatureType.CreditSystem,
	config: { usage_type: FeatureUsageType.Single, schema: [] },
	event_names: [],
};

test("never sends processors: feature Stripe products are managed outside the sheets", () => {
	const result = featureToCatalogFeatureParams({
		feature: { ...creditFeature, stripe_product_id: "prod_1" },
	});

	expect(result.processors).toBeUndefined();
});

test("a rate card left over from a credit system never ships with a metered feature", () => {
	const result = featureToCatalogFeatureParams({
		feature: {
			id: "messages",
			name: "Messages",
			type: FeatureType.Metered,
			// Switching type in the sheet used to leave the credit system's schema
			// behind, and the empty metered_feature_id failed API validation.
			config: {
				usage_type: FeatureUsageType.Single,
				schema: [
					{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 },
				],
			},
			event_names: [],
		},
	});

	expect(result.credit_schema).toBeUndefined();
	expect(result.consumable).toBe(true);
});

test("boolean features never ship a rate card", () => {
	const result = featureToCatalogFeatureParams({
		feature: {
			id: "sso",
			name: "SSO",
			type: FeatureType.Boolean,
			config: {
				schema: [
					{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 },
				],
			},
			event_names: [],
		},
	});

	expect(result.credit_schema).toBeUndefined();
});
