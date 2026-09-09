import type { FullSubject } from "@autumn/shared";

export const isThresholdBillingProduct = ({
	customerProduct,
}: {
	customerProduct: FullSubject["customer_products"][number];
}): boolean =>
	customerProduct.customer_prices.some((customerPrice) =>
		Boolean(
			(customerPrice.price.config as { threshold_billing?: unknown })
				.threshold_billing,
		),
	);
