import {
	type ApiBalance,
	type CusFeatureLegacyData,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	orgToInStatuses,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";

import { getApiBalance } from "./getApiBalance.js";

export const getApiBalances = async ({
	ctx,
	fullCus,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
}) => {
	const { org } = ctx;

	// fullCustomerToCustomerEntitlements already includes extra_customer_entitlements
	// and filters them by entity via cusEntMatchesEntity
	const allCusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses: orgToInStatuses({ org }),
		entity: fullCus.entity,
	});

	const featureToCusEnt: Record<string, FullCusEntWithFullCusProduct[]> = {};
	for (const cusEnt of allCusEnts) {
		const featureId = cusEnt.entitlement.feature.id;
		featureToCusEnt[featureId] = [
			...(featureToCusEnt[featureId] || []),
			cusEnt,
		];
	}

	const apiCusFeatures: Record<string, ApiBalance> = {};
	const cusFeaturesLegacyData: Record<string, CusFeatureLegacyData> = {};
	for (const key in featureToCusEnt) {
		const feature = featureToCusEnt[key][0].entitlement.feature;
		const cusEnts = featureToCusEnt[key];

		// 1. Get cus feature for each breakdown
		const { data, legacyData } = getApiBalance({
			ctx,
			fullCus,
			cusEnts,
			feature,
		});

		// Otherwise...
		apiCusFeatures[feature.id] = data;
		if (legacyData) {
			cusFeaturesLegacyData[feature.id] = legacyData;
		}
	}

	return { data: apiCusFeatures, legacyData: cusFeaturesLegacyData };
};
