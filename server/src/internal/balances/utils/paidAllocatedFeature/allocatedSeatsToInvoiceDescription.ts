import {
	type Feature,
	getFeatureInvoiceDescription,
	isVolumePrice,
	type Price,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";
import { volumeUsageToLineDescription } from "@shared/utils/billingUtils/invoicingUtils/descriptionUtils/volumeUsageToLineDescription";
import { volumeUsageToTier } from "@shared/utils/billingUtils/invoicingUtils/lineItemUtils/volumeUsageToTier";

/** A seat proration line's description. Volume names the seats over included at the tier
 * they reach, as renewal lines do; other prices keep the total-seat wording. */
export const allocatedSeatsToInvoiceDescription = ({
	price,
	product,
	feature,
	usage,
	allowance,
	currency,
}: {
	price: Price;
	product: Product;
	feature: Feature;
	usage: number;
	allowance: number;
	currency: string;
}): string => {
	const totalSeatDescription = getFeatureInvoiceDescription({
		feature,
		usage,
		billingUnits: (price.config as UsagePriceConfig).billing_units,
		prodName: product.name,
	});
	if (!isVolumePrice(price)) return totalSeatDescription;

	const overage = Math.max(0, usage - allowance);
	const billedTier = volumeUsageToTier({ price, overage, allowance, currency });
	// At 0 over included the seats sit in the included tier, which still reads as a volume line.
	if (!billedTier) return totalSeatDescription;

	return volumeUsageToLineDescription({
		...billedTier,
		context: {
			price,
			product,
			feature,
			currency,
			direction: "charge",
			now: Date.now(),
			billingTiming: "in_advance",
		},
		includePeriodDescription: false,
	});
};
