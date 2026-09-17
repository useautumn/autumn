import type { Price, UsagePriceConfig } from "@autumn/shared";

export const isThresholdBillingPrice = ({ price }: { price: Price }): boolean =>
	Boolean((price.config as UsagePriceConfig).threshold_billing);
