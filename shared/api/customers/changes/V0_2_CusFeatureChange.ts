import { ApiCustomerSchema } from "@api/customers/apiCustomer.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { z } from "zod/v4";
import {
	type ApiCusFeatureV0,
	ApiCusFeatureV0Schema,
} from "../cusFeatures/previousVersions/apiCusFeatureV0.js";
import { ApiCusFeatureV1Schema } from "../cusFeatures/previousVersions/apiCusFeatureV1.js";

/**
 * V0_2: Customer feature field additions
 *
 * This change handles the fields added in V0_2.
 * When transforming to V0_1, we remove: next_reset_at, allowance, usage_limit
 *
 * V0_2+ format (V1):
 *   - feature_id, unlimited, interval, balance, used
 *   - next_reset_at, allowance, usage_limit (added in V0_2)
 *
 * V0_1 format (V0):
 *   - feature_id, unlimited, interval, balance, used
 *   - NO next_reset_at, allowance, usage_limit (original format)
 */

// V0_2+ customer schema (features as array of V1 - with extra fields)
const V0_2_CustomerSchema = ApiCustomerSchema.extend({
	features: z.array(ApiCusFeatureV1Schema),
});

// V0_1 customer schema (features as array of V0 - original format)
const V0_1_CustomerSchema = ApiCustomerSchema.extend({
	features: z.array(ApiCusFeatureV0Schema),
});

export const V0_2_CusFeatureChange = defineVersionChange({
	version: ApiVersion.V0_2,
	description: [
		"Features: V1 format (with next_reset_at, allowance) → V0 format (minimal fields)",
	],

	affectedResources: [AffectedResource.Customer],
	newSchema: V0_2_CustomerSchema,
	oldSchema: V0_1_CustomerSchema,

	affectsRequest: false,
	affectsResponse: true,
	hasSideEffects: false,

	// Response: V0_2 Customer → V0_1 Customer
	// Remove next_reset_at, allowance, usage_limit fields
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof V0_2_CustomerSchema>;
	}) => {
		const v0_features: ApiCusFeatureV0[] = [];

		for (const feature of input.features) {
			// Unlimited features
			if (feature.unlimited) {
				const v0Feature = ApiCusFeatureV0Schema.parse({
					feature_id: feature.feature_id,
					unlimited: true,
					interval: null,
					balance: null,
					used: null,
				});
				v0_features.push(v0Feature);
				continue;
			}

			// Boolean/Static features
			if (!feature.interval && !feature.balance && feature.used === undefined) {
				const v0Feature = ApiCusFeatureV0Schema.parse({
					feature_id: feature.feature_id,
					interval: null,
				});
				v0_features.push(v0Feature);
				continue;
			}

			// Regular/Metered features - remove next_reset_at, allowance, usage_limit
			const v0Feature = ApiCusFeatureV0Schema.parse({
				feature_id: feature.feature_id,
				unlimited: feature.unlimited || false,
				interval: feature.interval,
				balance: feature.balance,
				used: feature.used,
				// Remove: next_reset_at, allowance, usage_limit
			});
			console.log("v0Feature", v0Feature);
			v0_features.push(v0Feature);
		}

		return {
			...input,
			features: v0_features,
		} satisfies z.infer<typeof V0_1_CustomerSchema>;
	},
});
