import {
	type ApiCusFeature,
	CusProductStatus,
	cusProductsToCusEnts,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusFeature } from "./getApiCusFeature.js";

export const getApiCusFeaturesObject = async ({
	ctx,
	fullCus,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
}) => {
	const { org } = ctx;

	const cusEntsWithCusProduct = cusProductsToCusEnts({
		cusProducts: fullCus.customer_products,
		inStatuses: org.config.include_past_due
			? [CusProductStatus.Active, CusProductStatus.PastDue]
			: [CusProductStatus.Active],
	});

	const featureToCusEnt: Record<string, FullCusEntWithFullCusProduct[]> = {};
	for (const cusEnt of cusEntsWithCusProduct) {
		const featureId = cusEnt.entitlement.feature.id;
		featureToCusEnt[featureId] = [
			...(featureToCusEnt[featureId] || []),
			cusEnt,
		];
	}

	const apiCusFeatures: Record<string, ApiCusFeature> = {};
	for (const key in featureToCusEnt) {
		const feature = featureToCusEnt[key][0].entitlement.feature;
		const cusEnts = featureToCusEnt[key];

		// 1. Get cus feature for each breakdown
		const apiCusFeature = getApiCusFeature({
			ctx,
			fullCus,
			cusEnts,
			feature,
		});

		// Otherwise...
		apiCusFeatures[feature.id] = apiCusFeature;
	}

	return apiCusFeatures;
};

export const getApiCusFeatures = async ({
	ctx,
	fullCus,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
}) => {
	return getApiCusFeaturesObject({ ctx, fullCus });
};
