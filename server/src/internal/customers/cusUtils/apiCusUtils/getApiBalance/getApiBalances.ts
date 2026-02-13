import {
	type ApiBalanceV1,
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
}): Promise<{ data: Record<string, ApiBalanceV1> }> => {
	const { org } = ctx;

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

	const apiCusFeatures: Record<string, ApiBalanceV1> = {};
	for (const key in featureToCusEnt) {
		const feature = featureToCusEnt[key][0].entitlement.feature;
		const cusEnts = featureToCusEnt[key];

		const { data } = getApiBalance({
			ctx,
			fullCus,
			cusEnts,
			feature,
		});

		apiCusFeatures[feature.id] = data;
	}

	return { data: apiCusFeatures };
};
