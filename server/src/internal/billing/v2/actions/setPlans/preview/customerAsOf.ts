import {
	type CusProduct,
	customerEntitlementToNextResetAt,
	type EntInterval,
	type FullCustomer,
	type FullCustomerEntitlement,
	isLifetimeEntitlement,
} from "@autumn/shared";

/** Runs each reset due by `at` as the reset job would, on the plan's billing anchor. */
const rollResetPast = ({
	customerEntitlement,
	customerProduct,
	at,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: CusProduct | null;
	at: number;
}) => {
	const { entitlement } = customerEntitlement;
	if (isLifetimeEntitlement({ entitlement })) return;

	while (
		customerEntitlement.next_reset_at &&
		customerEntitlement.next_reset_at <= at
	) {
		customerEntitlement.next_reset_at = customerEntitlementToNextResetAt({
			customerEntitlement: {
				next_reset_at: customerEntitlement.next_reset_at,
				entitlement: {
					interval: entitlement.interval as EntInterval,
					interval_count: entitlement.interval_count ?? 1,
				},
				customer_product: customerProduct,
			},
			billingCycleAnchor: customerProduct?.billing_cycle_anchor ?? undefined,
			now: customerEntitlement.next_reset_at,
		});
	}
};

/** The customer at `at`: resets due by then have run, so each next reset is the first after it. */
export const customerAsOf = ({
	fullCustomer,
	at,
}: {
	fullCustomer: FullCustomer;
	at: number;
}): FullCustomer => {
	const customer = structuredClone(fullCustomer);
	for (const customerProduct of customer.customer_products) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			rollResetPast({ customerEntitlement, customerProduct, at });
		}
	}
	for (const customerEntitlement of customer.extra_customer_entitlements ??
		[]) {
		rollResetPast({ customerEntitlement, customerProduct: null, at });
	}
	return customer;
};
