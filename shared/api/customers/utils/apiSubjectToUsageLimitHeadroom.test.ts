import { describe, expect, test } from "bun:test";
import {
	FeatureType,
	FeatureUsageType,
} from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { AppEnv } from "../../../models/genModels/genEnums.js";
import type { ApiSubjectV0 } from "../apiSubjectV0.js";
import { apiSubjectToUsageLimitHeadroom } from "./apiSubjectToUsageLimitHeadroom.js";

const buildFeature = ({
	id,
	type,
	config,
}: Pick<Feature, "id" | "type" | "config">): Feature => ({
	internal_id: `fe_${id}`,
	org_id: "org_test",
	created_at: 1,
	env: AppEnv.Sandbox,
	id,
	name: id,
	type,
	config,
	display: null,
	archived: false,
	event_names: [],
	model_markups: null,
	stripe_meter: null,
});

describe("apiSubjectToUsageLimitHeadroom", () => {
	test("converts source-feature headroom using the flat per-unit credit rate", () => {
		const originalFeature = buildFeature({
			id: "feature_a",
			type: FeatureType.Metered,
			config: { usage_type: FeatureUsageType.Single },
		});
		const creditFeature = buildFeature({
			id: "credits",
			type: FeatureType.CreditSystem,
			config: {
				usage_type: FeatureUsageType.Single,
				schema: [
					{
						metered_feature_id: originalFeature.id,
						feature_amount: 100,
						credit_amount: 1,
					},
				],
			},
		});
		const apiSubject = {
			billing_controls: {
				usage_limits: [
					{
						feature_id: originalFeature.id,
						enabled: true,
						limit: 100,
						usage: 0,
						interval: "month",
					},
				],
			},
		} as unknown as ApiSubjectV0;

		expect(
			apiSubjectToUsageLimitHeadroom({
				apiSubject,
				feature: creditFeature,
				originalFeature,
			}),
		).toBe(1);
	});
});
