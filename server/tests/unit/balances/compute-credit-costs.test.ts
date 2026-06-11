import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { computeCreditCosts } from "@/internal/balances/utils/deduction/computeCreditCosts.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";

const makeFeature = (
	id: string,
	type: FeatureType,
	schema: { metered_feature_id: string; credit_amount: number }[] = [],
): Feature => ({
	internal_id: `fe_${id}`,
	org_id: "org_test",
	created_at: 0,
	env: "sandbox" as Feature["env"],
	id,
	name: id,
	type,
	config: { schema, usage_type: FeatureUsageType.Single },
	archived: false,
	event_names: [],
	model_markups: null,
});

const makeCusEnt = (id: string, feature: Feature) =>
	({ id, entitlement: { feature } }) as FullCusEntWithFullCusProduct;

const messages = makeFeature("messages", FeatureType.Metered);
const credits = makeFeature("credits", FeatureType.CreditSystem, [
	{ metered_feature_id: "messages", credit_amount: 0.2 },
]);
// Simulates a stale cached snapshot whose schema no longer includes "messages".
const staleCredits = makeFeature("credits", FeatureType.CreditSystem, [
	{ metered_feature_id: "other_feature", credit_amount: 5 },
]);

describe("computeCreditCosts", () => {
	test("applies schema ratios for parent credit systems", () => {
		const deduction: FeatureDeduction = { feature: messages, deduction: 10 };
		const lookup = computeCreditCosts({
			cusEnts: [makeCusEnt("ce_msg", messages), makeCusEnt("ce_cred", credits)],
			deduction,
		});

		expect(lookup("ce_msg")).toBe(1);
		expect(lookup("ce_cred")).toBe(0.2);
	});

	test("token deductions use their USD cost 1:1 and ratio-map to parents", () => {
		const aiCredits = makeFeature("ai_credits", FeatureType.AiCreditSystem);
		const orbs = makeFeature("orbs", FeatureType.CreditSystem, [
			{ metered_feature_id: "ai_credits", credit_amount: 1000 },
		]);
		const deduction: FeatureDeduction = {
			feature: aiCredits,
			deduction: 1,
			tokens: {
				usage: { modelName: "custom/m", inputTokens: 1, outputTokens: 1 },
				cost: 0.125,
			},
		};
		const lookup = computeCreditCosts({
			cusEnts: [makeCusEnt("ce_ai", aiCredits), makeCusEnt("ce_orbs", orbs)],
			deduction,
		});

		expect(lookup("ce_ai")).toBe(0.125);
		expect(lookup("ce_orbs")).toBe(125);
	});

	test("stale schema snapshot falls back to 1 instead of failing the track", () => {
		const deduction: FeatureDeduction = { feature: messages, deduction: 10 };
		const lookup = computeCreditCosts({
			cusEnts: [makeCusEnt("ce_stale", staleCredits)],
			deduction,
		});

		expect(lookup("ce_stale")).toBe(1);
	});
});
