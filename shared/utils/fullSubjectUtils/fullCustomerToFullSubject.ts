import {
	type FullCustomer,
	type FullSubject,
	SubjectType,
} from "../../index.js";

export const fullCustomerToFullSubject = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): FullSubject => {
	const customerId = fullCustomer.id || fullCustomer.internal_id;
	const entityId = fullCustomer.entity?.id ?? undefined;
	const internalEntityId = fullCustomer.entity?.internal_id ?? undefined;

	return {
		subjectType: fullCustomer.entity
			? SubjectType.Entity
			: SubjectType.Customer,
		customerId,
		internalCustomerId: fullCustomer.internal_id,
		entityId,
		internalEntityId,
		customer: fullCustomer,
		entity: fullCustomer.entity,
		customer_products: fullCustomer.customer_products,
		extra_customer_entitlements: fullCustomer.extra_customer_entitlements ?? [],
		subscriptions: fullCustomer.subscriptions,
		invoices: fullCustomer.invoices ?? [],
		aggregated_customer_products: undefined,
		aggregated_customer_entitlements: undefined,
	};
};
