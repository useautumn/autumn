import {
	type ApiBalanceV1,
	type ApiFlagV0,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	orgToInStatuses,
	type SharedContext,
	scopeExpandForCtx,
} from "@autumn/shared";
import { getApiFlag } from "../../flags/utils/getApiFlag.js";
import { getApiBalance } from "./getApiBalance.js";

export const getApiBalances = async ({
	ctx,
	fullCus,
}: {
	ctx: SharedContext;
	fullCus: FullCustomer;
}): Promise<{
	balances: Record<string, ApiBalanceV1>;
	flags: Record<string, ApiFlagV0>;
}> => {
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

	const apiBalances: Record<string, ApiBalanceV1> = {};
	const apiFlags: Record<string, ApiFlagV0> = {};

	const flagScopedCtx = scopeExpandForCtx({
		ctx,
		prefix: ["flags", "flag"],
	});

	const balancesScopedCtx = scopeExpandForCtx({
		ctx,
		prefix: ["balances", "balance"],
	});

	for (const key in featureToCusEnt) {
		const feature = featureToCusEnt[key][0].entitlement.feature;
		const cusEnts = featureToCusEnt[key];

		if (feature.type === FeatureType.Boolean) {
			const { data } = getApiFlag({
				ctx: flagScopedCtx,
				cusEnts,
				feature,
			});

			apiFlags[feature.id] = data;
			continue;
		}

		const { data } = getApiBalance({
			ctx: balancesScopedCtx,
			fullCus,
			cusEnts,
			feature,
		});

		apiBalances[feature.id] = data;
	}

	return {
		balances: apiBalances,
		flags: apiFlags,
	};
};
