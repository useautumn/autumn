import { ApiFeatureType } from "@api/features/prevVersions/apiFeatureV0";
import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { EntInterval } from "@models/productModels/intervals/entitlementInterval";
import { z } from "zod/v4";
import {
	type ApiCusFeatureV2,
	ApiCusFeatureV2Schema,
} from "../cusFeatures/previousVersions/apiCusFeatureV2";
import type { ApiCusFeatureV3BreakdownSchema } from "../cusFeatures/previousVersions/apiCusFeatureV3";
import { ApiCustomerV3Schema } from "../previousVersions/apiCustomerV3";

const V1_2_CustomerSchema = ApiCustomerV3Schema;

const V1_1_CustomerSchema = ApiCustomerV3Schema.extend({
	features: z.array(ApiCusFeatureV2Schema),
});

type MergedBreakdownItem = {
	interval: EntInterval | null | undefined;
	interval_count: number | null | undefined;
	balance: number;
	usage: number;
	included_usage: number;
	next_reset_at: number | null | undefined;
	usage_limit: number | null | undefined;
	overage_allowed: boolean;
};

function mergeBreakdownItems({
	breakdown,
}: {
	breakdown: Array<z.infer<typeof ApiCusFeatureV3BreakdownSchema>>;
}): MergedBreakdownItem[] {
	const mergedBreakdownMap = new Map<string, MergedBreakdownItem>();

	for (const breakdownItem of breakdown) {
		const legacyBreakdownKey = `${breakdownItem.interval}:${breakdownItem.interval_count ?? 1}:${breakdownItem.overage_allowed}`;

		const existing = mergedBreakdownMap.get(legacyBreakdownKey);
		if (existing) {
			existing.balance = (existing.balance ?? 0) + (breakdownItem.balance ?? 0);
			existing.usage = (existing.usage ?? 0) + (breakdownItem.usage ?? 0);
			existing.included_usage =
				(existing.included_usage ?? 0) + (breakdownItem.included_usage ?? 0);

			if (
				breakdownItem.next_reset_at !== null &&
				breakdownItem.next_reset_at !== undefined
			) {
				if (
					existing.next_reset_at === null ||
					existing.next_reset_at === undefined ||
					breakdownItem.next_reset_at < existing.next_reset_at
				) {
					existing.next_reset_at = breakdownItem.next_reset_at;
				}
			}

			const itemUsageLimit =
				breakdownItem.usage_limit ?? breakdownItem.included_usage ?? 0;
			const existingUsageLimit =
				existing.usage_limit ?? existing.included_usage ?? 0;
			existing.usage_limit = existingUsageLimit + itemUsageLimit;

			if (breakdownItem.overage_allowed === true) {
				existing.overage_allowed = true;
			}
		} else {
			mergedBreakdownMap.set(legacyBreakdownKey, {
				interval: breakdownItem.interval ?? null,
				interval_count: breakdownItem.interval_count ?? null,
				balance: breakdownItem.balance ?? 0,
				usage: breakdownItem.usage ?? 0,
				included_usage: breakdownItem.included_usage ?? 0,
				next_reset_at: breakdownItem.next_reset_at ?? null,
				usage_limit:
					breakdownItem.usage_limit || breakdownItem.included_usage || null,
				overage_allowed: breakdownItem.overage_allowed ?? false,
			});
		}
	}

	return Array.from(mergedBreakdownMap.values());
}

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

	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof V1_2_CustomerSchema>;
	}) => {
		const v1_1_features: ApiCusFeatureV2[] = [];

		for (const [_featureId, feature] of Object.entries(input.features)) {
			if (feature.breakdown && feature.breakdown.length > 0) {
				const mergedBreakdownItems = mergeBreakdownItems({
					breakdown: feature.breakdown,
				});

				for (const mergedItem of mergedBreakdownItems) {
					v1_1_features.push({
						feature_id: feature.id,
						interval: mergedItem.interval,
						interval_count: mergedItem.interval_count,
						balance: mergedItem.balance,
						usage: mergedItem.usage,
						included_usage: mergedItem.included_usage,
						next_reset_at: mergedItem.next_reset_at,
						usage_limit: mergedItem.usage_limit,
						unlimited: feature.unlimited,
						overage_allowed: mergedItem.overage_allowed,
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
				} satisfies ApiCusFeatureV2);
			}
		}

		return {
			...input,
			features: v1_1_features,
		} satisfies z.infer<typeof V1_1_CustomerSchema>;
	},
});
