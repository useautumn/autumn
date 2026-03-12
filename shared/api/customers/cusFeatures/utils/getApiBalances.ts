import {
	type ApiBalanceV1,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	orgToInStatuses,
	type SharedContext,
} from "@autumn/shared";
import { getApiBalance } from "./getApiBalance.js";

export const getApiBalances = async ({
	ctx,
	fullCus,
}: {
	ctx: SharedContext;
	fullCus: FullCustomer;
}): Promise<{ data: Record<string, ApiBalanceV1> }> => {
	const allCusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses: orgToInStatuses({ org: ctx.org }),
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
