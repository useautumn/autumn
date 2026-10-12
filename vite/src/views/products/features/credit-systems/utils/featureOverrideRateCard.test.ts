import { expect, test } from "bun:test";
import { type Feature, FeatureType } from "@autumn/shared";
import { featureOverrideRateCard } from "./featureOverrideRateCard";

const features = [
	{ id: "gateway", name: "Gateway spend (USD)", type: FeatureType.Metered },
	{ id: "tokens", name: "Tokens", type: FeatureType.Metered },
] as Feature[];

const card = (
	override: Parameters<typeof featureOverrideRateCard>[0]["override"],
) =>
	featureOverrideRateCard({ override, features }).map(
		({ label, value }) => `${label}: ${value}`,
	);

test("flat, tiered and dimensioned rates read as the customer sheet shows them", () => {
	expect(
		card({
			schema: [
				{
					metered_feature_id: "gateway",
					credit_amount: 1500,
					feature_amount: 1000,
				},
				{
					metered_feature_id: "tokens",
					tier_behavior: "graduated",
					tiers: [
						{ to: 100, credit_amount: 3 },
						{ to: "inf", credit_amount: 1 },
					],
				},
				{
					metered_feature_id: "unknown_feature",
					credit_amount: 1,
					dimensions: {
						fast: { match: { speed: "fast" }, credit_amount: 2 },
					},
					multipliers: { batch: { match: { batch: "true" }, factor: 0.5 } },
				},
			],
		}),
	).toEqual([
		"Gateway Spend (USD): 1,500 credits per 1,000",
		"Tokens: 1–3 credits (tiered)",
		"unknown_feature: varies by event · 1 rate, 1 multiplier",
	]);
});

test("markups list the default, each provider and a per-model count", () => {
	expect(
		card({
			markups: {
				provider_markups: { anthropic: { markup: 15 } },
				model_markups: {
					"openai/gpt-4o": { markup: 5 },
					"openai/o3": { markup: 10 },
				},
			},
		}),
	).toEqual([
		"Default: 0% markup",
		"anthropic: 15% markup",
		"Per-model: 2 models",
	]);
});

test("a dimension's priority is part of its detailed rate", () => {
	const [line] = featureOverrideRateCard({
		override: {
			schema: [
				{
					metered_feature_id: "gateway",
					credit_amount: 1,
					dimensions: {
						fast: { match: { speed: "fast" }, credit_amount: 2, priority: 3 },
					},
				},
			],
		},
		features,
	});
	expect(line.detail).toBe(
		"1 credits · fast (speed=fast) priority 3 2 credits",
	);
});
