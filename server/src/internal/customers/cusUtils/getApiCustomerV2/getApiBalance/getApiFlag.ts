import { getApiFlag } from "@api/customers/flags/utils/getApiFlag.js";
import type { ApiFlagV0 } from "@autumn/shared";
import {
	dbToApiFeatureV1,
	expandPathIncludes,
	type Feature,
	type FullAggregatedFeatureBalance,
	type FullCusEntWithFullCusProduct,
	type SharedContext,
	scopeExpandForCtx,
} from "@autumn/shared";

export const getApiFlagV2 = ({
	ctx,
	customerEntitlements,
	feature,
	aggregatedFeatureBalance,
}: {
	ctx: SharedContext;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	feature: Feature;
	aggregatedFeatureBalance?: FullAggregatedFeatureBalance;
}): ApiFlagV0 | undefined => {
	if (customerEntitlements.length > 0) {
		const { data } = getApiFlag({
			ctx,
			cusEnts: customerEntitlements,
			feature,
		});

		return data;
	}

	if (!aggregatedFeatureBalance) return undefined;

	const featureCtx = scopeExpandForCtx({
		ctx,
		prefix: "feature",
	});

	const apiFeature = expandPathIncludes({
		expand: ctx.expand,
		includes: ["feature"],
	})
		? dbToApiFeatureV1({
				ctx: featureCtx,
				dbFeature: aggregatedFeatureBalance.feature,
			})
		: undefined;

	return {
		object: "flag",
		id: aggregatedFeatureBalance.api_id,
		plan_id: null,
		expires_at: null,
		feature_id: aggregatedFeatureBalance.feature_id,
		feature: apiFeature,
	};
};
