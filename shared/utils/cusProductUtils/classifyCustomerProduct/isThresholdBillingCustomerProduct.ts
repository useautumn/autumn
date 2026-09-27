import type { Price } from "../../../models/productModels/priceModels/priceModels.js";

/** A plan bills by threshold when any of its prices carries a threshold; past-due, it stops funding usage. */
export const isThresholdBillingCustomerProduct = ({
	customerProduct,
}: {
	customerProduct: { customer_prices: { price: Pick<Price, "config"> }[] };
}): boolean =>
	customerProduct.customer_prices.some(({ price }) =>
		Boolean(
			(price.config as { threshold_billing?: unknown }).threshold_billing,
		),
	);
