import type { Price, UsagePriceConfig } from "@autumn/shared";

export const priceThresholdBilling = ({
	price,
}: {
	price: Price;
}): { threshold: number } | undefined =>
	(price.config as UsagePriceConfig).threshold_billing ?? undefined;

export const isThresholdBillingPrice = ({ price }: { price: Price }): boolean =>
	priceThresholdBilling({ price }) !== undefined;
