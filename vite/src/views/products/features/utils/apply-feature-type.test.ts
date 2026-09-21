import { expect, test } from "bun:test";
import { FeatureType, FeatureUsageType } from "@autumn/shared";
import { applyFeatureType } from "./applyFeatureType";

const creditSystemDraft = {
	id: "credits",
	name: "Credits",
	type: FeatureType.CreditSystem,
	config: {
		usage_type: FeatureUsageType.Single,
		schema: [{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 }],
	},
	event_names: [],
};

test("switching a credit system to metered drops the rate card", () => {
	const result = applyFeatureType({
		feature: creditSystemDraft,
		type: FeatureType.Metered,
	});

	expect(result.type).toBe(FeatureType.Metered);
	expect(result.config).toEqual({ usage_type: FeatureUsageType.Single });
	expect(result.name).toBe("Credits");
	expect(result.id).toBe("credits");
});

test("switching a credit system to boolean drops the rate card and markups", () => {
	const result = applyFeatureType({
		feature: {
			...creditSystemDraft,
			type: FeatureType.AiCreditSystem,
			model_markups: { "openai/gpt-5": { markup: 20 } },
		},
		type: FeatureType.Boolean,
	});

	expect(result.config).toEqual({});
	expect(result.model_markups).toBeNull();
});

test("re-picking metered keeps the usage type the user already chose", () => {
	const result = applyFeatureType({
		feature: {
			...creditSystemDraft,
			type: FeatureType.Metered,
			config: { usage_type: FeatureUsageType.Continuous },
		},
		type: FeatureType.Metered,
	});

	expect(result.config.usage_type).toBe(FeatureUsageType.Continuous);
});

test("switching to a credit system starts a fresh rate card", () => {
	const result = applyFeatureType({
		feature: {
			...creditSystemDraft,
			type: FeatureType.Metered,
			config: { usage_type: FeatureUsageType.Continuous },
		},
		type: FeatureType.CreditSystem,
	});

	expect(result.config.usage_type).toBe(FeatureUsageType.Single);
	expect(result.config.schema).toEqual([
		{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 },
	]);
});
