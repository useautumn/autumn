import { type ApiPlanV1, ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { type ApiPlan, ApiPlanSchema } from "../apiPlan.js";
import {
	type PlanLegacyData,
	PlanLegacyDataSchema,
} from "../planLegacyData.js";

export const V2_0_PlanChanges = defineVersionChange({
	newVersion: ApiVersion.V2_1, // Breaking change introduced in V2
	oldVersion: ApiVersion.V2_0, // Applied when targetVersion <= V1.2
	description: [
		"Plan format changed from V2.0 to V2.1 schema",
		"Renamed default to auto_enable",
		"Renamed granted_balance to included",
		"Removed reset_usage_when_enabled",
	],
	affectedResources: [AffectedResource.Product],
	newSchema: ApiPlanV1Schema,
	oldSchema: ApiPlanSchema,
	legacyDataSchema: PlanLegacyDataSchema,

	// Only transform responses (requests handled manually in handler)
	affectsRequest: false,
	affectsResponse: true,

	// Response: V2.1 Plan -> V2.0 Plan
	transformResponse: ({
		input,
		legacyData,
	}: {
		input: ApiPlanV1;
		legacyData?: PlanLegacyData;
	}): ApiPlan => {
		// Convert plan to V2.0 format
		// Key changes:
		// - auto_enable -> default
		// - included -> granted_balance
		// - reset gains reset_when_enabled (default to false)
		return {
			...input,
			default: input.auto_enable,
			features: input.features.map((feature) => {
				// Destructure to remove V2.1-only fields
				const { included, ...restFeature } = feature;

				return {
					...restFeature,
					granted_balance: included,
					reset: feature.reset
						? {
								interval: feature.reset.interval,
								interval_count: feature.reset.interval_count,
								reset_when_enabled: false, // V2.0 has this field, default to false
							}
						: null,
				};
			}),
		} satisfies ApiPlan;
	},
});
