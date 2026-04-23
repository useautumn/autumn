import { getApiFlag } from "@api/customers/flags/utils/getApiFlag.js";
import type { ApiFlagV0 } from "@autumn/shared";
import {
	type AggregatedSubjectFlag,
	dbToApiFeatureV1,
	expandPathIncludes,
	type Feature,
	type FullCusEntWithFullCusProduct,
	type SharedContext,
	scopeExpandForCtx,
} from "@autumn/shared";

export const getApiFlagV2 = ({
	ctx,
	customerEntitlements,
	feature,
	aggregatedSubjectFlag,
}: {
	ctx: SharedContext;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	feature: Feature;
	aggregatedSubjectFlag?: AggregatedSubjectFlag;
}): ApiFlagV0 | undefined => {
	if (customerEntitlements.length > 0) {
		const { data } = getApiFlag({
			ctx,
			cusEnts: customerEntitlements,
			feature,
		});

		return data;
	}

	// Fallback: no rehydrated cus_ent (e.g. partial cache where booleans
	// weren't materialized). Build a minimal flag from the aggregated view.
	if (!aggregatedSubjectFlag) return undefined;

	const featureCtx = scopeExpandForCtx({ ctx, prefix: "feature" });
	const apiFeature = expandPathIncludes({
		expand: ctx.expand,
		includes: ["feature"],
	})
		? dbToApiFeatureV1({ ctx: featureCtx, dbFeature: feature })
		: undefined;

	return {
		object: "flag",
		id: aggregatedSubjectFlag.api_id,
		plan_id: null,
		expires_at: null,
		feature_id: aggregatedSubjectFlag.feature_id,
		feature: apiFeature,
	};
};
