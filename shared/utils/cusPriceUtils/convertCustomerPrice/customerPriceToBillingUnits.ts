import type { FullCustomerPrice, UsagePriceConfig } from "@autumn/shared";

export const customerPriceToBillingUnits = ({
	customerPrice,
}: {
	customerPrice: FullCustomerPrice;
}): number => {
	const config = customerPrice.price.config as UsagePriceConfig;
	return config.billing_units ?? 1;
};
