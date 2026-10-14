import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import {
	type ApiCusFeatureV1,
	ApiCusFeatureV1Schema,
} from "../cusFeatures/previousVersions/apiCusFeatureV1";
import type { ApiCusFeatureV2 } from "../cusFeatures/previousVersions/apiCusFeatureV2";
import { transformCusProductV2ToV1 } from "../cusPlans/changes/V0.2_CusProductChange";
import {
	type CustomerLegacyData,
	CustomerLegacyDataSchema,
} from "../customerLegacyData";
import { ApiCustomerV1Schema } from "../previousVersions/apiCustomerV1";
import { ApiCustomerV2Schema } from "../previousVersions/apiCustomerV2";

export const V0_2_CustomerChange = defineVersionChange({
	name: "V0_2_CustomerChange",
	newVersion: ApiVersion.V1_1,
	oldVersion: ApiVersion.V0_2,
	description: [
		"Customer response split into separate objects (customer, products, add_ons, entitlements, invoices)",
		"Features renamed to entitlements",
		"Features: V2 format (usage, included_usage, interval_count) → V1 format (used, allowance)",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCustomerV2Schema,
	oldSchema: ApiCustomerV1Schema,

	legacyDataSchema: CustomerLegacyDataSchema,

	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof ApiCustomerV2Schema>;
		legacyData?: CustomerLegacyData;
	}) => {
		const v1_features: ApiCusFeatureV1[] = transformFeaturesV2ToV1({
			features: input.features,
		});

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
			payment_method: customerFields.payment_method,
		} satisfies z.infer<typeof ApiCustomerV1Schema>;
	},
});

function transformFeaturesV2ToV1({
	features,
}: {
	features: ApiCusFeatureV2[];
}): ApiCusFeatureV1[] {
	const v1_features: ApiCusFeatureV1[] = [];

	for (const feature of features) {
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

		const v1Feature = ApiCusFeatureV1Schema.parse({
			feature_id: feature.feature_id,
			unlimited: feature.unlimited || false,
			interval: feature.interval,
			balance: feature.balance,
			used: feature.usage,
			next_reset_at: feature.next_reset_at,
			allowance: feature.included_usage,
			usage_limit: feature.usage_limit,
		});
		v1_features.push(v1Feature);
	}

	return v1_features;
}
