import {
	EntityNotFoundError,
	type FullCustomer,
	type MultiUpdateItemV0,
	type MultiUpdateParamsV0,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

/** Per-update entity_id wins over the request-level default. */
export const multiUpdateItemToParams = ({
	params,
	item,
}: {
	params: MultiUpdateParamsV0;
	item: MultiUpdateItemV0;
}): UpdateSubscriptionV1Params => ({
	customer_id: params.customer_id,
	entity_id: item.entity_id ?? params.entity_id,
	plan_id: item.plan_id,
	subscription_id: item.subscription_id,
	customer_product_id: item.customer_product_id,
	cancel_action: item.cancel_action,
	proration_behavior: item.proration_behavior,
});

export const narrowFullCustomerToEntity = ({
	fullCustomer,
	entityId,
}: {
	fullCustomer: FullCustomer;
	entityId?: string;
}): FullCustomer => {
	if (!entityId) return fullCustomer;

	const entity = fullCustomer.entities.find(
		(candidate) =>
			candidate.id === entityId || candidate.internal_id === entityId,
	);
	if (!entity) throw new EntityNotFoundError({ entityId });

	return { ...fullCustomer, entity };
};
