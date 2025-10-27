import { ApiFeatureType } from "@api/features/apiFeature.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { z } from "zod/v4";
import {
	type ApiCusFeatureV2,
	ApiCusFeatureV2Schema,
} from "../cusFeatures/previousVersions/apiCusFeatureV2.js";
import { ApiCustomerV3Schema } from "../previousVersions/apiCustomerV3.js";

/**
 * V1_2: Features changed from array to object AND merged multi-interval features
 *
 * V1_2+ format:
 *   - Features as object keyed by feature_id
 *   - Multi-interval features merged with breakdown array
 *
 * V1_1 format:
 *   - Features as array
 *   - Multi-interval features as separate array entries (no breakdown)
 */

// V1_2+ customer schema (features as object with breakdown)
const V1_2_CustomerSchema = ApiCustomerV3Schema;

// V1_1 customer schema (features as array without breakdown)
const V1_1_CustomerSchema = ApiCustomerV3Schema.extend({
	features: z.array(ApiCusFeatureV2Schema),
});

export const V1_1_FeaturesArrayToObject = defineVersionChange({
	name: "V1_1_FeaturesArrayToObject",
	newVersion: ApiVersion.V1_2,
	oldVersion: ApiVersion.V1_1,

	description: [
		"Features: object with breakdown → array with expanded intervals",
	],

	affectedResources: [AffectedResource.Customer],
	newSchema: V1_2_CustomerSchema,
	oldSchema: V1_1_CustomerSchema,

	affectsRequest: false,
	affectsResponse: true,
	hasSideEffects: false,

	// Response: V1_2 Customer → V1_1 Customer
	// 1. Expand features with breakdown into separate entries
	// 2. Convert object to array
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof V1_2_CustomerSchema>;
	}) => {
		const v1_1_features: ApiCusFeatureV2[] = [];

		for (const [_featureId, feature] of Object.entries(input.features)) {
			// If feature has breakdown, expand into separate entries
			if (feature.breakdown && feature.breakdown.length > 0) {
				// Expand: combine parent feature identity with breakdown interval-specific data
				for (const breakdownItem of feature.breakdown) {
					v1_1_features.push({
						feature_id: feature.id,

						// All interval-specific data from breakdown
						interval: breakdownItem.interval,
						interval_count: breakdownItem.interval_count,
						balance: breakdownItem.balance,
						usage: breakdownItem.usage,
						included_usage: breakdownItem.included_usage,
						next_reset_at: breakdownItem.next_reset_at,
						usage_limit:
							breakdownItem.usage_limit || breakdownItem.included_usage,
						rollovers: breakdownItem.rollovers,

						// Feature-level fields (same for all intervals)
						unlimited: false,
						overage_allowed: false,
						// credit_schema: feature.credit_schema,
					} satisfies ApiCusFeatureV2);
				}
			} else {
				if (feature.unlimited) {
					v1_1_features.push({
						feature_id: feature.id,
						unlimited: true,
					});
					continue;
				} else if (feature.type === ApiFeatureType.Static) {
					v1_1_features.push({
						feature_id: feature.id,
					});
					continue;
				}
				// No breakdown - just remove the breakdown field
				v1_1_features.push({
					feature_id: feature.id,
					interval: feature.interval === "multiple" ? null : feature.interval,
					interval_count: feature.interval_count,
					balance: feature.balance,
					usage: feature.usage,
					included_usage: feature.included_usage,
					next_reset_at: feature.next_reset_at,
					usage_limit: feature.usage_limit || feature.included_usage,
					rollovers: feature.rollovers,
					unlimited: feature.unlimited,
					overage_allowed: feature.overage_allowed,
					// credit_schema: feature.credit_schema,
				} satisfies ApiCusFeatureV2);
			}
		}

		// Boolean / unlimited features don't have the rest of the fields

		// Validation happens automatically in VersionChange base class
		return {
			...input,
			features: v1_1_features,
		} satisfies z.infer<typeof V1_1_CustomerSchema>;
	},
});
