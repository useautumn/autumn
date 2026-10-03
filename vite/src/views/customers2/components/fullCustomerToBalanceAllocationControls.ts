import {
	type BalanceAllocationControl,
	entIntvToResetIntv,
	type FullCustomer,
} from "@autumn/shared";

/** Stored allocations are keyed by internal entity id; the API shape uses public entity ids. */
export const fullCustomerToBalanceAllocationControls = ({
	fullCustomer,
}: {
	fullCustomer?: FullCustomer;
}): BalanceAllocationControl[] => {
	const entityIdByInternalId = new Map(
		(fullCustomer?.entities ?? []).map((entity) => [
			entity.internal_id,
			entity.id,
		]),
	);

	return Object.values(fullCustomer?.balance_allocations ?? {}).map(
		(allocation) => ({
			feature_id: allocation.feature_id,
			interval: entIntvToResetIntv({ entInterval: allocation.interval }),
			allocations: Object.entries(allocation.amounts).flatMap(
				([internalEntityId, amount]) => {
					const entityId = entityIdByInternalId.get(internalEntityId);
					return entityId ? [{ entity_id: entityId, amount }] : [];
				},
			),
		}),
	);
};
