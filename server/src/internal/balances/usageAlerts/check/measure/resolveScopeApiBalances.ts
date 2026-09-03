import {
	type ApiBalanceV1,
	type Feature,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	getApiBalance,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TrackedSubjects } from "../types/trackedSubjects.js";

const fullCustomerToApiBalance = ({
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
	return getApiBalance({
		ctx,
		fullCus: fullCustomer,
		cusEnts: customerEntitlements,
		feature,
	}).data;
};

export const resolveScopeApiBalances = ({
	ctx,
	tracked,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	tracked: TrackedSubjects;
	feature: Feature;
	entityId?: string;
}): { before: ApiBalanceV1; after: ApiBalanceV1 } => ({
	before: fullCustomerToApiBalance({
		ctx,
		fullCustomer: tracked.before.fullCustomer,
		feature,
		entityId,
	}),
	after: fullCustomerToApiBalance({
		ctx,
		fullCustomer: tracked.after.fullCustomer,
		feature,
		entityId,
	}),
});
