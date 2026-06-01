import {
	cp,
	cusProductsToPrices,
	type FullCusProduct,
	getSmallestInterval,
} from "@autumn/shared";

/** Chooses the interval that defines the next invoice boundary. */
export const getSmallestIntervalForNextCycle = ({
	customerProducts,
	currentEpochMs,
}: {
	customerProducts: FullCusProduct[];
	currentEpochMs: number;
}) => {
	const currentCustomerProducts = customerProducts.filter(
		(customerProduct) => cp(customerProduct).hasActiveStatus().valid,
	);
	let scheduledStartMs: number | null = null;

	for (const customerProduct of customerProducts) {
		if (!cp(customerProduct).scheduled().valid) continue;
		if (customerProduct.starts_at <= currentEpochMs) continue;

		scheduledStartMs =
			scheduledStartMs === null
				? customerProduct.starts_at
				: Math.min(scheduledStartMs, customerProduct.starts_at);
	}

	const scheduledStartCustomerProducts =
		scheduledStartMs === null
			? []
			: customerProducts.filter(
					(customerProduct) => customerProduct.starts_at === scheduledStartMs,
				);

	const currentPrices = cusProductsToPrices({
		cusProducts: currentCustomerProducts,
		filters: { excludeOneOffPrices: true },
	});
	const scheduledStartPrices = cusProductsToPrices({
		cusProducts: scheduledStartCustomerProducts,
		filters: { excludeOneOffPrices: true },
	});

	return getSmallestInterval({
		prices: currentPrices.length > 0 ? currentPrices : scheduledStartPrices,
	});
};
