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
import { roundUsage } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";

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
		usage: roundUsage({ usage, price }),
		billingUnits: (price.config as UsagePriceConfig).billing_units,
		prodName: product.name,
	});
	if (!isVolumePrice(price)) return totalSeatDescription;

	const overage = Math.max(0, usage - allowance);
	const billedTier = volumeUsageToTier({ price, overage, allowance, currency });
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
