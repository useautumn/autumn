import {
	type ApiBalance,
	type CusFeatureLegacyData,
	type FullCusEntWithOptionalProduct,
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

	const cusEntsWithCusProduct = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses: orgToInStatuses({ org }),
		entity: fullCus.entity,
	});

	// Add extra entitlements (loose entitlements not tied to a product)
	const extraEnts: FullCusEntWithOptionalProduct[] = (
		fullCus.extra_customer_entitlements || []
	).map((ent) => ({
		...ent,
		customer_product: null,
	}));

	// Combine both sources
	const allCusEnts: FullCusEntWithOptionalProduct[] = [
		...cusEntsWithCusProduct,
		...extraEnts,
	];

	const featureToCusEnt: Record<string, FullCusEntWithOptionalProduct[]> = {};
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
