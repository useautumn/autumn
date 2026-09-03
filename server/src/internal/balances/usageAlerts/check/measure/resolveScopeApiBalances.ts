import {
	type ApiBalanceV1,
	type Feature,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	getApiBalance,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const apiBalanceOf = ({
	ctx,
	fullCustomer,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	feature: Feature;
	entityId?: string;
}): ApiBalanceV1 => {
	const entity = entityId
		? fullCustomer.entities?.find((candidate) => candidate.id === entityId)
		: undefined;
	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId: feature.id,
		entity,
	});
	return getApiBalance({ ctx, fullCus: fullCustomer, cusEnts: customerEntitlements, feature }).data;
};

/** The balance a scope measures: the entity's when the scope names one, else the customer aggregate. */
export const resolveScopeApiBalances = ({
	ctx,
	oldFullCus,
	newFullCus,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
}): { before: ApiBalanceV1; after: ApiBalanceV1 } => ({
	before: apiBalanceOf({ ctx, fullCustomer: oldFullCus, feature, entityId }),
	after: apiBalanceOf({ ctx, fullCustomer: newFullCus, feature, entityId }),
});
