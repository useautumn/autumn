import { describe, expect, test } from "bun:test";
import {
	OrganisationConfigurationSchema,
	PricingAgentFeatureInputSchema,
} from "@/internal/misc/pricingAgent/pricingAgentSchemas.js";

const creditFeature = {
	id: "credits",
	name: "Credits",
	type: "credit_system" as const,
	display: { singular: "credit", plural: "credits" },
	invoice_credit: true,
	credit_schema: [
		{
			metered_feature_id: "feature_a",
			billing_units: 100,
			credit_cost: 1,
		},
		{
			metered_feature_id: "feature_b",
			tier_behavior: "graduated" as const,
			tiers: [{ to: "inf" as const, credit_cost: 0.5 }],
		},
	],
};

describe("pricing-agent credit rate-card schema", () => {
	test("preserves the expanded credit rate-card union", () => {
		const result = OrganisationConfigurationSchema.parse({
			features: [creditFeature],
			products: [],
		});

		expect(result.features[0]).toMatchObject({
			invoice_credit: true,
			credit_schema: [
				{
					metered_feature_id: "feature_a",
					billing_units: 100,
					credit_cost: 1,
				},
				{
					metered_feature_id: "feature_b",
					tier_behavior: "graduated",
					tiers: [{ to: "inf", credit_cost: 0.5 }],
				},
			],
		});
	});

	test("accepts the same shape for preview and configuration sync", () => {
		expect(PricingAgentFeatureInputSchema.parse(creditFeature)).toMatchObject(
			creditFeature,
		);
	});
});
