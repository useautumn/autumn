import { ApiCustomerSchema } from "@api/customers/apiCustomer.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { z } from "zod/v4";
import {
	type ApiCusFeatureV1,
	ApiCusFeatureV1Schema,
} from "../cusFeatures/previousVersions/apiCusFeatureV1.js";
import { ApiCusFeatureV2Schema } from "../cusFeatures/previousVersions/apiCusFeatureV2.js";

/**
 * V1_1: Customer feature schema changes
 *
 * V1_1+ format (V2):
 *   - id (feature id)
 *   - usage (current usage)
 *   - included_usage (allowance)
 *   - interval_count (interval multiplier)
 *   - overage_allowed (whether overages permitted)
 *   - type, name (feature metadata)
 *   - rollovers (rollover data)
 *
 * V1_0 format (V1):
 *   - feature_id (feature id)
 *   - used (current usage)
 *   - allowance (included usage)
 *   - next_reset_at, usage_limit
 *   - No interval_count
 *   - No overage_allowed
 *   - No type, name
 *   - No rollovers
 */

// V1_1+ customer schema (features as array of V2)
const V1_1_CustomerSchema = ApiCustomerSchema.extend({
	features: z.array(ApiCusFeatureV2Schema),
});

// V1_0 customer schema (features as array of V1)
const V1_0_CustomerSchema = ApiCustomerSchema.extend({
	features: z.array(ApiCusFeatureV1Schema),
});

export const V1_1_CusFeatureChange = defineVersionChange({
	version: ApiVersion.V1_1,
	description: [
		"Features: V2 format (usage, included_usage, interval_count) → V1 format (used, allowance)",
		"Renamed features to entitlements",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: V1_1_CustomerSchema,
	oldSchema: V1_0_CustomerSchema,

	affectsRequest: false,
	affectsResponse: true,
	hasSideEffects: false,

	// Response: V2 Customer → V1 Customer
	// Transform field names and structure
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof V1_1_CustomerSchema>;
	}) => {
		const v1_features: ApiCusFeatureV1[] = [];

		for (const feature of input.features) {
			// Unlimited features
			if (feature.unlimited) {
				const v1Feature = ApiCusFeatureV1Schema.parse({
					feature_id: feature.feature_id,
					unlimited: true,
					interval: null,
					balance: null,
					used: null,
				});
				v1_features.push(v1Feature);
				continue;
			}

			// Boolean/Static features (only have feature_id, no other fields)
			if (
				!feature.interval &&
				!feature.balance &&
				feature.usage === undefined &&
				feature.included_usage === undefined
			) {
				const v1Feature = ApiCusFeatureV1Schema.parse({
					feature_id: feature.feature_id,
					interval: null,
				});
				v1_features.push(v1Feature);
				continue;
			}

			// Regular/Metered features
			const v1Feature = ApiCusFeatureV1Schema.parse({
				feature_id: feature.feature_id,
				unlimited: feature.unlimited || false,
				interval: feature.interval,
				balance: feature.balance,
				used: feature.usage, // usage → used
				next_reset_at: feature.next_reset_at,
				allowance: feature.included_usage, // included_usage → allowance
				usage_limit: feature.usage_limit,
				// Remove: interval_count, overage_allowed, rollovers
			});
			v1_features.push(v1Feature);
		}

		return {
			...input,
			features: v1_features,
		} satisfies z.infer<typeof V1_0_CustomerSchema>;
	},
});
