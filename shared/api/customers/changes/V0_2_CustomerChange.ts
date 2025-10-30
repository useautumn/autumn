import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import {
	type ApiCusFeatureV1,
	ApiCusFeatureV1Schema,
} from "../cusFeatures/previousVersions/apiCusFeatureV1.js";
import type { ApiCusFeatureV2 } from "../cusFeatures/previousVersions/apiCusFeatureV2.js";
import { transformCusProductV2ToV1 } from "../cusProducts/changes/V0_2_CusProductChange.js";
import {
	type CustomerLegacyData,
	CustomerLegacyDataSchema,
} from "../customerLegacyData.js";
import { ApiCustomerV1Schema } from "../previousVersions/apiCustomerV1.js";
import { ApiCustomerV2Schema } from "../previousVersions/apiCustomerV2.js";

/**
 * V0_2_CustomerChange: Transforms customer response TO V0_2 format
 *
 * Applied when: targetVersion <= V0_2
 *
 * Breaking changes introduced in V1.1 (that we reverse here):
 *
 * 1. Structure: Merged customer object → Split structure
 *    - V1.1+: Single merged object with all fields
 *    - V0_2: Split into {customer, products, add_ons, entitlements, invoices}
 *
 * 2. Features: Renamed and transformed
 *    - V1.1+: "features" with usage/included_usage/interval_count fields
 *    - V0_2: "entitlements" with used/allowance fields
 *
 * Input: ApiCustomerV2 (V1.1+ merged format)
 * Output: ApiCustomerV1 (V0_2 split format)
 */

export const V0_2_CustomerChange = defineVersionChange({
	name: "V0_2_CustomerChange",
	newVersion: ApiVersion.V1_1, // Breaking change introduced in V1_1
	oldVersion: ApiVersion.V0_2, // Applied when targetVersion <= V0_2
	description: [
		"Customer response split into separate objects (customer, products, add_ons, entitlements, invoices)",
		"Features renamed to entitlements",
		"Features: V2 format (usage, included_usage, interval_count) → V1 format (used, allowance)",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCustomerV2Schema,
	oldSchema: ApiCustomerV1Schema,

	legacyDataSchema: CustomerLegacyDataSchema,

	// Response: V1.1+ (V2) → V0_2 (V1)
	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof ApiCustomerV2Schema>;
		legacyData?: CustomerLegacyData;
	}) => {
		// Step 1: Transform features V2 → V1
		const v1_features: ApiCusFeatureV1[] = transformFeaturesV2ToV1({
			features: input.features,
		});

		// Step 2: Split merged structure
		const {
			features: _features,
			products = [],
			invoices,
			trials_used,
			...customerFields
		} = input;

		const mainProducts = products
			.filter((p) => !p.is_add_on)
			.map((p) =>
				transformCusProductV2ToV1({
					input: p,
					legacyData: legacyData?.cusProductLegacyData[p.id],
				}),
			);

		const addOns = products
			.filter((p) => p.is_add_on)
			.map((p) =>
				transformCusProductV2ToV1({
					input: p,
					legacyData: legacyData?.cusProductLegacyData[p.id],
				}),
			);

		const processor = customerFields.stripe_id
			? {
					type: "stripe",
					id: customerFields.stripe_id,
				}
			: undefined;

		return {
			customer: {
				...customerFields,
				internal_id: "",
				processor,
			},
			products: mainProducts,
			add_ons: addOns,

			entitlements: v1_features,
			invoices: invoices || [],
			trials_used,
		} satisfies z.infer<typeof ApiCustomerV1Schema>;
	},
});

/**
 * Transform features from V2 format to V1 format
 *
 * V2 → V1 field mappings:
 * - usage → used
 * - included_usage → allowance
 * - Remove: interval_count, overage_allowed, rollovers
 */
function transformFeaturesV2ToV1({
	features,
}: {
	features: ApiCusFeatureV2[];
}): ApiCusFeatureV1[] {
	const v1_features: ApiCusFeatureV1[] = [];

	for (const feature of features) {
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

	return v1_features;
}
