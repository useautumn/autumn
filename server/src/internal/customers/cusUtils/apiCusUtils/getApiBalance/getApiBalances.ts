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

	const allCusEntsFromFullCustomer = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses: orgToInStatuses({ org }),
		entity: fullCus.entity,
	});

	// Filter out loose entitlements (customer_product is null) - they come from extra_customer_entitlements
	const cusEntsWithCusProduct = allCusEntsFromFullCustomer.filter(
		(ent) => ent.customer_product !== null,
	);

	// Add extra entitlements (loose entitlements not tied to a product)
	const extraEnts: FullCusEntWithFullCusProduct[] = (
		fullCus.extra_customer_entitlements || []
	).map((ent) => ({
		...ent,
		customer_product: null,
	}));

	// Combine both sources
	const allCusEnts: FullCusEntWithFullCusProduct[] = [
		...cusEntsWithCusProduct,
		...extraEnts,
	];

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
