import {
	addCusProductToCusEnt,
	cusEntsToAllowance,
	cusEntToPrepaidInvoiceOverage,
	type FullCusProduct,
	type FullCustomerPrice,
	isFixedPrice,
	isOneOffPrice,
	isPrepaidPrice,
	priceToLineAmount,
} from "@autumn/shared";

/** A full period of one recurring price, as an invoice line would bill it; arrears usage is null. */
const customerPriceToPeriodAmount = ({
	customerProduct,
	customerPrice: { price },
	currency,
}: {
	customerProduct: FullCusProduct;
	customerPrice: FullCustomerPrice;
	currency: string;
}): number | null => {
	if (isFixedPrice(price)) return priceToLineAmount({ price, currency });
	if (!isPrepaidPrice(price)) return null;

	const customerEntitlement = customerProduct.customer_entitlements.find(
		({ entitlement_id }) => entitlement_id === price.entitlement_id,
	);
	if (!customerEntitlement) return null;

	const cusEnt = addCusProductToCusEnt({
		cusEnt: customerEntitlement,
		cusProduct: customerProduct,
	});
	return priceToLineAmount({
		price,
		overage: cusEntToPrepaidInvoiceOverage({ cusEnt }),
		allowance: cusEntsToAllowance({ cusEnts: [cusEnt] }),
		currency,
	});
};

/** Recurring cost per billing interval ("month:1", "year:1"), before discounts and proration. */
export const customerProductsToRecurringTotals = ({
	customerProducts,
	currency,
}: {
	customerProducts: FullCusProduct[];
	currency: string;
}): Map<string, number> => {
	const totals = new Map<string, number>();
	for (const customerProduct of customerProducts) {
		for (const customerPrice of customerProduct.customer_prices) {
			if (isOneOffPrice(customerPrice.price)) continue;
			const amount = customerPriceToPeriodAmount({
				customerProduct,
				customerPrice,
				currency,
			});
			if (amount === null) continue;

			const { interval, interval_count } = customerPrice.price.config;
			const key = `${interval}:${interval_count ?? 1}`;
			totals.set(key, (totals.get(key) ?? 0) + amount);
		}
	}
	return totals;
};
