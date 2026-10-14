import type { Price } from "../../../models/productModels/priceModels/priceModels.js";

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
