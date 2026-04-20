import {
	type ApiBalanceV1,
	type ApiFlagV0,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	isEntityCusEnt,
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
	let allCusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses: orgToInStatuses({ org: ctx.org }),
		entity: fullCus.entity,
	});

	// When disable_pooled_balance is enabled and we're scoped to an entity, drop
	// customer-level (shared pool) cusEnts so the returned balances reflect
	// only the entity's own pool. Matches the filter in prepareFeatureDeduction
	// so the deduction path and reporting stay consistent.
	if (fullCus.entity?.id && fullCus.config?.disable_pooled_balance) {
		allCusEnts = allCusEnts.filter((ce) => isEntityCusEnt({ cusEnt: ce }));
	}

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
