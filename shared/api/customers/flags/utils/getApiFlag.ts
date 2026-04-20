import {
	cusEntsToPlanId,
	dbToApiFeatureV1,
	expandPathIncludes,
	type Feature,
	type FullCusEntWithFullCusProduct,
	type SharedContext,
	scopeExpandForCtx,
} from "@autumn/shared";
import type { ApiFlagV0 } from "../apiFlagV0";

export const getApiFlag = ({
	ctx,
	cusEnts,
	feature,
}: {
	ctx: SharedContext;
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
}): { data: ApiFlagV0 } => {
	const featureCtx = scopeExpandForCtx({
		ctx,
		prefix: "feature",
	});

	const shouldExpandFeature = expandPathIncludes({
		expand: ctx.expand,
		includes: ["feature"],
	});

	const apiFeature = shouldExpandFeature
		? dbToApiFeatureV1({
				ctx: featureCtx,
				dbFeature: feature,
			})
		: undefined;

	const primaryCustomerEntitlement = cusEnts[0];
	const apiId =
		primaryCustomerEntitlement.external_id ?? primaryCustomerEntitlement.id;

	return {
		data: {
			object: "flag",
			id: apiId,
			plan_id: cusEntsToPlanId({ cusEnts }),
			expires_at: primaryCustomerEntitlement.expires_at,
			feature_id: feature.id,
			feature: apiFeature,
		},
	};
};
