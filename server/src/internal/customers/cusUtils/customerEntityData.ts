import {
	type ApiVersionClass,
	backwardsChangeActive,
	type FullCustomer,
	type FullSubject,
	V2_3_CustomerEntityData,
} from "@autumn/shared";

export const shouldAggregateEntityData = ({
	apiVersion,
}: {
	/** Omit for callers that are not tied to a request's API version. */
	apiVersion?: ApiVersionClass;
}): boolean => {
	if (!apiVersion) return true;

	return backwardsChangeActive({
		apiVersion,
		versionChange: V2_3_CustomerEntityData,
	});
};

/** FullSubject carries entity rows as pre-computed aggregates, never as products. */
export const subjectWithoutEntityData = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullSubject => ({
	...fullSubject,
	aggregated_customer_products: undefined,
	aggregated_customer_entitlements: undefined,
	aggregated_subject_flags: undefined,
});

const isEntityScoped = (row: { internal_entity_id?: string | null }): boolean =>
	!!row.internal_entity_id;

/** FullCustomer list rows carry entity products inline, so they are dropped. */
export const fullCustomerWithoutEntityData = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): FullCustomer => ({
	...fullCustomer,
	customer_products: fullCustomer.customer_products.filter(
		(customerProduct) => !isEntityScoped(customerProduct),
	),
	extra_customer_entitlements: fullCustomer.extra_customer_entitlements?.filter(
		(customerEntitlement) => !isEntityScoped(customerEntitlement),
	),
	pooled_customer_entitlements:
		fullCustomer.pooled_customer_entitlements?.filter(
			(customerEntitlement) => !isEntityScoped(customerEntitlement),
		),
});
