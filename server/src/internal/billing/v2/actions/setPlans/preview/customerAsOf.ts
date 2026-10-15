import {
	type CusProduct,
	customerEntitlementToNextResetAt,
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
	const { interval, interval_count } = entitlement;
	if (!interval || isLifetimeEntitlement({ entitlement })) return;

	const nextReset = (resetAt: number) =>
		customerEntitlementToNextResetAt({
			customerEntitlement: {
				next_reset_at: resetAt,
				entitlement: { interval, interval_count },
				customer_product: customerProduct,
			},
			billingCycleAnchor: customerProduct?.billing_cycle_anchor ?? undefined,
			now: resetAt,
		});

	let resetAt = customerEntitlement.next_reset_at;
	while (resetAt && resetAt <= at) resetAt = nextReset(resetAt);
	customerEntitlement.next_reset_at = resetAt;
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
