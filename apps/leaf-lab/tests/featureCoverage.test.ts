import { expect, test } from "bun:test";
import { buildFeatureCoverageQuestions } from "../lib/featureCoverage.js";

const evidence = {
	facts: {
		listFeatures: {
			list: [
				{ id: "credits", name: "Credits", type: "metered" },
				{ id: "platform_api", name: "Platform Api", type: "boolean" },
				{ id: "brand_controls", name: "Brand Controls", type: "boolean" },
			],
		},
	},
};

test("asks one literal question per absent feature and per finite allowance, scoped to the plan target", () => {
	const { questions, meanings } = buildFeatureCoverageQuestions({
		evidence,
		effectivePlans: [
			{
				actionIndex: 0,
				phaseIndex: 2,
				planId: "enterprise",
				sourceKnown: true,
				addOn: false,
				items: [
					{
						feature_id: "credits",
						included: 1000,
						reset: { interval: "month" },
					},
					{ feature_id: "platform_api", included: 1, unlimited: true },
				],
			},
		],
	});
	expect(Object.keys(questions).sort()).toEqual([
		"coverage_0_2_enterprise__absent__brand_controls",
		"coverage_0_2_enterprise__quantity__credits",
		"coverage_0_2_enterprise__unpurchased__platform_api",
	]);
	const priced = buildFeatureCoverageQuestions({
		evidence,
		effectivePlans: [
			{
				actionIndex: 0,
				planId: "enterprise",
				sourceKnown: true,
				addOn: false,
				items: [
					{
						feature_id: "credits",
						included: 5000,
						price: {
							billing_method: "prepaid",
							tiers: [{ to: 6000, amount: 0, flat_amount: 200 }],
						},
					},
					{
						feature_id: "credits",
						included: 0,
						price: { billing_method: "usage_based", amount: 0.01 },
					},
				],
			},
		],
	});
	expect(priced.questions.coverage_0_x_enterprise__pricing__credits).toContain(
		"2 slot(s)",
	);
	expect(priced.questions.coverage_0_x_enterprise__pricing__credits).toContain(
		"prepaid slot (1 prepaid tiers, included 5000); usage_based slot (0.01 per unit, included 0)",
	);
	expect(
		questions.coverage_0_2_enterprise__unpurchased__platform_api,
	).toContain('INCLUDES the feature "Platform Api"');
	expect(questions.coverage_0_2_enterprise__absent__brand_controls).toContain(
		'does NOT include the feature "Brand Controls" (id brand_controls)',
	);
	expect(questions.coverage_0_2_enterprise__absent__brand_controls).toContain(
		"action 0 phase 2 plan enterprise",
	);
	expect(questions.coverage_0_2_enterprise__quantity__credits).toContain(
		'includes 1000 of "Credits" (id credits) resetting every month',
	);
	expect(meanings.coverage_0_2_enterprise__absent__brand_controls).toEqual({
		target: "action 0 phase 2 plan enterprise",
		featureId: "brand_controls",
		kind: "absent",
	});
});

test("unknown sources and add-on packs produce no absent-feature questions", () => {
	const { questions } = buildFeatureCoverageQuestions({
		evidence,
		effectivePlans: [
			{ actionIndex: 0, planId: "mystery", sourceKnown: false },
			{
				actionIndex: 0,
				phaseIndex: 0,
				planId: "security_pack",
				sourceKnown: true,
				addOn: true,
				items: [{ feature_id: "brand_controls", included: 1, unlimited: true }],
			},
		],
	});
	expect(questions).toEqual({});
});
