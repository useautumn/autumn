import type { FullSubject } from "@autumn/shared";
import { isThresholdBillingPrice } from "./isThresholdBillingPrice.js";

export const isThresholdBillingProduct = ({
	customerProduct,
}: {
	customerProduct: FullSubject["customer_products"][number];
}): boolean =>
	customerProduct.customer_prices.some((customerPrice) =>
		isThresholdBillingPrice({ price: customerPrice.price }),
	);
