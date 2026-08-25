import { describe, expect, test } from "bun:test";
import {
	FeatureType,
	FeatureUsageType,
} from "../models/featureModels/featureEnums.js";
import type { Feature } from "../models/featureModels/featureModels.js";
import { AppEnv } from "../models/genModels/genEnums.js";
import { agentFeatureToFeature, featureToAgentFeature } from "./agentTypes.js";

describe("pricing-agent credit rate cards", () => {
	test("preserves per-X rates, graduated tiers, and invoice-credit mode", () => {
		const feature: Feature = {
			internal_id: "fe_credits",
			org_id: "org_test",
			created_at: 1,
			env: AppEnv.Sandbox,
			id: "credits",
			name: "Credits",
			type: FeatureType.CreditSystem,
			config: {
				usage_type: FeatureUsageType.Single,
				invoice_credit: true,
				schema: [
					{
						metered_feature_id: "feature_a",
						feature_amount: 100,
						credit_amount: 1,
					},
					{
						metered_feature_id: "feature_b",
						feature_amount: 1_000,
						tier_behavior: "graduated",
						tiers: [
							{ to: 10_000, credit_amount: 1 },
							{ to: "inf", credit_amount: 0.5 },
						],
					},
				],
			},
			display: null,
			archived: false,
			event_names: [],
			model_markups: null,
			stripe_meter: null,
		};

		const agentFeature = featureToAgentFeature(feature);
		expect(agentFeature).toMatchObject({
			invoice_credit: true,
			credit_schema: [
				{
					metered_feature_id: "feature_a",
					billing_units: 100,
					credit_cost: 1,
				},
				{
					metered_feature_id: "feature_b",
					billing_units: 1_000,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_cost: 1 },
						{ to: "inf", credit_cost: 0.5 },
					],
				},
			],
		});

		const restoredFeature = agentFeatureToFeature(agentFeature);
		expect(restoredFeature.config).toMatchObject(feature.config);
	});
});
