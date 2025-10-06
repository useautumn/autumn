import {
	type ApiCusFeature,
	CusProductStatus,
	cusEntToKey,
	cusProductsToCusEnts,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { V1_2_FeaturesArrayToObject } from "@shared/api/customers/cusFeatures/changes/V1_2_FeaturesArrayToObject.js";
import { isBeforeChange } from "@shared/api/versionUtils/versionChangeUtils/applyVersionChanges.js";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusFeature } from "./getApiCusFeature.js";

// V0 of customer, get list
export const getApiCusFeaturesList = async ({
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

	const keyToCusEnts: Record<string, FullCusEntWithFullCusProduct[]> = {};
	for (const cusEnt of cusEntsWithCusProduct) {
		const key = cusEntToKey({ cusEnt });
		keyToCusEnts[key] = [...(keyToCusEnts[key] || []), cusEnt];
	}

	const apiCusFeatures: ApiCusFeature[] = [];
	for (const key in keyToCusEnts) {
		const feature = keyToCusEnts[key][0].entitlement.feature;
		const cusEnts = keyToCusEnts[key];
		const apiCusFeature = getApiCusFeature({
			ctx,
			fullCus,
			cusEnts,
			feature,
		});
		apiCusFeatures.push(apiCusFeature);
	}

	return apiCusFeatures;
};

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
	console.log("MADE IT HERE!!");
	if (
		isBeforeChange({
			targetVersion: ctx.apiVersion,
			versionChange: V1_2_FeaturesArrayToObject,
		})
	) {
		return getApiCusFeaturesList({ ctx, fullCus });
	}

	return getApiCusFeaturesObject({ ctx, fullCus });
};
