/** Verbatim copy of the server function this package replaces; the parity tests run it beside the new one. */
import type { Price, UsagePriceConfig } from "@autumn/shared";

/** `Price.config` is a union; only the usage variant declares a threshold. */
export const priceThresholdBilling = ({
	price,
}: {
	price: Price;
}): { threshold: number } | undefined =>
	(price.config as UsagePriceConfig).threshold_billing ?? undefined;
