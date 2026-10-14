import {
	type CusProduct,
	customerEntitlementToNextResetAt,
	EntInterval,
	type FullCustomer,
} from "@autumn/shared";

/** Each reset due by `at`, run one at a time as the reset job would, on the plan's billing anchor. */
const nextResetAfter = ({
	resetAt,
	interval,
	intervalCount,
	customerProduct,
	at,
}: {
	resetAt: number;
	interval: EntInterval;
	intervalCount: number;
	customerProduct: CusProduct | null;
	at: number;
}) => {
	let nextResetAt = resetAt;
	while (nextResetAt <= at) {
		nextResetAt = customerEntitlementToNextResetAt({
			customerEntitlement: {
				next_reset_at: nextResetAt,
				entitlement: { interval, interval_count: intervalCount },
				customer_product: customerProduct,
			},
			billingCycleAnchor: customerProduct?.billing_cycle_anchor ?? undefined,
			now: nextResetAt,
		});
	}
	return nextResetAt;
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
	const customerEntitlements = [
		...customer.customer_products.flatMap((customerProduct) =>
			customerProduct.customer_entitlements.map((customerEntitlement) => ({
				customerEntitlement,
				customerProduct: customerProduct as CusProduct | null,
			})),
		),
		...(customer.extra_customer_entitlements ?? []).map(
			(customerEntitlement) => ({ customerEntitlement, customerProduct: null }),
		),
	];
	for (const { customerEntitlement, customerProduct } of customerEntitlements) {
		const { next_reset_at: nextResetAt, entitlement } = customerEntitlement;
		if (!nextResetAt || nextResetAt > at) continue;
		if (!entitlement.interval || entitlement.interval === EntInterval.Lifetime)
			continue;

		customerEntitlement.next_reset_at = nextResetAfter({
			resetAt: nextResetAt,
			interval: entitlement.interval,
			intervalCount: entitlement.interval_count ?? 1,
			customerProduct,
			at,
		});
	}
	return customer;
};
