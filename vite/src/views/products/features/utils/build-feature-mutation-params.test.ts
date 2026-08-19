import { expect, test } from "bun:test";
import { FeatureType, Infinite } from "@autumn/shared";
import { buildFeatureMarkupParams } from "./buildFeatureMutationParams";

test("classic credit systems preserve graduated rate cards and invoice credits", () => {
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
		invoiceCredit: true,
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
	expect(result.invoice_credit).toBe(true);
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
		invoiceCredit: true,
	});

	expect(result.credit_schema).toBeUndefined();
	expect(result.invoice_credit).toBeUndefined();
	expect(result.model_markups).toEqual({
		"openai/gpt-5": { markup: 20 },
	});
	expect(result.default_markup).toBe(10);
	expect(result.provider_markups).toEqual({ openai: { markup: 15 } });
});
