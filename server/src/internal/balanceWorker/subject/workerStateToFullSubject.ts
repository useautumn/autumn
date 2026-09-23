import {
	type Catalog,
	type SubjectState,
	subjectStateToFullSubject,
	type WorkerFullCustomerEntitlement,
} from "@autumn/balance-engine";
import {
	CustomerSchema,
	FullCusProductSchema,
	type FullCustomerEntitlement,
	FullCustomerEntitlementSchema,
	type FullSubject,
	type Invoice,
	type Subscription,
} from "@autumn/shared";

/** The worker holds no replaceables; the shared shape wants the list. */
const withReplaceables = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
}) => ({ ...customerEntitlement, replaceables: [] });

const toFullCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
}): FullCustomerEntitlement =>
	FullCustomerEntitlementSchema.parse(
		withReplaceables({ customerEntitlement }),
	);

/**
 * A customer's subject as the worker holds it, in the shape `getApiCustomerV2` renders.
 * Parsed, not cast: the worker's rows are whole only once hydrated since the widening.
 */
export const workerStateToFullSubject = ({
	state,
	catalog,
	subscriptions,
	invoices,
}: {
	state: SubjectState;
	catalog: Catalog;
	subscriptions: Subscription[];
	invoices: Invoice[];
}): FullSubject => {
	const workerFullSubject = subjectStateToFullSubject({ state, catalog });
	const customer = CustomerSchema.parse(workerFullSubject.customer);

	return {
		subjectType: "customer",
		customerId: state.identity.customerId,
		internalCustomerId: customer.internal_id,
		customer,
		customer_products: workerFullSubject.customer_products.map(
			(customerProduct) =>
				FullCusProductSchema.parse({
					...customerProduct,
					customer_entitlements: customerProduct.customer_entitlements.map(
						(customerEntitlement) => withReplaceables({ customerEntitlement }),
					),
				}),
		),
		extra_customer_entitlements:
			workerFullSubject.extra_customer_entitlements.map((customerEntitlement) =>
				toFullCustomerEntitlement({ customerEntitlement }),
			),
		pooled_customer_entitlements:
			workerFullSubject.pooled_customer_entitlements.map(
				(customerEntitlement) =>
					toFullCustomerEntitlement({ customerEntitlement }),
			),
		usage_windows: workerFullSubject.usage_windows,
		subscriptions,
		invoices,
	};
};
