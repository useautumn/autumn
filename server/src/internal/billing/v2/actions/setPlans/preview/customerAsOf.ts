import {
	EntInterval,
	type FullCustomer,
	type FullCustomerEntitlement,
	getNextResetAt,
} from "@autumn/shared";

/** The customer at `at`: resets due by then have run, so each next reset is the first after it. */
export const customerAsOf = ({
	fullCustomer,
	at,
}: {
	fullCustomer: FullCustomer;
	at: number;
}): FullCustomer => {
	const customer = structuredClone(fullCustomer);
	const customerEntitlements: FullCustomerEntitlement[] = [
		...customer.customer_products.flatMap(
			(customerProduct) => customerProduct.customer_entitlements,
		),
		...(customer.extra_customer_entitlements ?? []),
	];
	for (const customerEntitlement of customerEntitlements) {
		const { next_reset_at: nextResetAt, entitlement } = customerEntitlement;
		if (!nextResetAt || nextResetAt > at) continue;
		if (!entitlement.interval || entitlement.interval === EntInterval.Lifetime)
			continue;

		customerEntitlement.next_reset_at = getNextResetAt({
			curReset: nextResetAt,
			interval: entitlement.interval,
			intervalCount: entitlement.interval_count ?? 1,
			now: at,
		});
	}
	return customer;
};
