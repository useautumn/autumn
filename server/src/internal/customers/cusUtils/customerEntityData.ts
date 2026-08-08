import {
	type ApiVersionClass,
	backwardsChangeActive,
	type FullCustomer,
	type FullSubject,
	V2_3_CustomerEntityData,
} from "@autumn/shared";

/**
 * Up to V2_3 a customer-level read folded in the subscriptions and balances
 * attached to that customer's entities. From V2_4 the Customer object reports
 * only what is attached to the customer itself.
 *
 * Drives the hydration query (skipping an aggregation that scales with the
 * customer's entity count) as well as the response builders.
 */
export const shouldAggregateEntityData = ({
	apiVersion,
}: {
	apiVersion: ApiVersionClass;
}): boolean =>
	backwardsChangeActive({
		apiVersion,
		versionChange: V2_3_CustomerEntityData,
	});

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

/**
 * FullCustomer (the list path) carries entity rows inline rather than as
 * aggregates, so they are dropped rather than blanked. Mirrors what the
 * FullSubject query already excludes at customer level.
 */
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
