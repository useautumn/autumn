import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import {
	type ApiCusFeatureV0,
	ApiCusFeatureV0Schema,
} from "../cusFeatures/previousVersions/apiCusFeatureV0.js";
import { ApiCustomerV0Schema } from "../previousVersions/apiCustomerV0.js";
import { ApiCustomerV1Schema } from "../previousVersions/apiCustomerV1.js";

/**
 * V0_1_CustomerChange: Transforms customer TO V0_1 format
 *
 * Applied when: targetVersion <= V0_1
 *
 * Fields added in V0_2 (that we remove here):
 * - next_reset_at
 * - allowance
 * - usage_limit
 *
 * V0_2+ format (V1):
 *   - feature_id, unlimited, interval, balance, used
 *   - next_reset_at, allowance, usage_limit (added in V0_2)
 *
 * V0_1 format (V0):
 *   - feature_id, unlimited, interval, balance, used
 *   - NO next_reset_at, allowance, usage_limit (original format)
 */

export const V0_1_CustomerChange = defineVersionChange({
	oldVersion: ApiVersion.V0_1, // Applied when targetVersion <= V0_1
	newVersion: ApiVersion.V0_2, // Breaking change introduced in V0_2
	description: [
		"Features: V1 format (with next_reset_at, allowance) → V0 format (minimal fields)",
	],

	affectedResources: [AffectedResource.Customer],
	oldSchema: ApiCustomerV0Schema,
	newSchema: ApiCustomerV1Schema,

	// Response: V0_2 Customer → V0_1 Customer
	// Remove next_reset_at, allowance, usage_limit fields
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof ApiCustomerV1Schema>;
	}) => {
		const v0_features: ApiCusFeatureV0[] = [];

		for (const feature of input.entitlements) {
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
			if (!feature.interval && !feature.balance && !feature.unlimited) {
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

			v0_features.push(v0Feature);
		}

		const products = input.products.map((p) => {
			const {
				current_period_start: _currentPeriodStart,
				current_period_end: _currentPeriodEnd,
				...rest
			} = p;
			return rest;
		});

		return {
			...input,
			customer: {
				...input.customer,
				name: input.customer.name || "",
				email: input.customer.email || "",
				fingerprint: input.customer.fingerprint || "",
			},
			entitlements: v0_features,
			products,
		} satisfies z.infer<typeof ApiCustomerV0Schema>;
	},
});
