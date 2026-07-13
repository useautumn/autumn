import {
	cusEntToBillingObjects,
	type FullCusEntWithFullCusProduct,
	getPriceCurrencyStripeId,
	InternalError,
	roundUsageToNearestBillingUnit,
	type StripeItemSpec,
	type UsagePriceConfig,
} from "@autumn/shared";
import { cusEntToInvoiceUsage } from "@shared/utils/cusEntUtils/overageUtils/cusEntToInvoiceUsage";

/**
 * Converts an in-arrear prorated (allocated) price to a StripeItemSpec.
 * Computes existing usage from the cusEnt.
 */
export const allocatedToStripeItemSpec = ({
	cusEntWithCusProduct,
	currency,
	orgDefault,
}: {
	cusEntWithCusProduct: FullCusEntWithFullCusProduct;
	currency: string;
	orgDefault: string;
}): StripeItemSpec | null => {
	const billing = cusEntToBillingObjects({ cusEnt: cusEntWithCusProduct });
	if (!billing) return null;

	const { price, product } = billing;
	const config = price.config as UsagePriceConfig;

	const stripePriceId = getPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_price_id",
	});
	if (!stripePriceId) {
		throw new InternalError({
			message: `[allocatedToStripeItemSpec] no stripe_price_id for currency '${currency}' on autumn price: ${price.id}`,
		});
	}

	const existingUsage = cusEntToInvoiceUsage({
		cusEnt: cusEntWithCusProduct,
		subtractReplaceables: true,
	});

	// Round existing usage to the nearest billing unit
	const roundedUsage = roundUsageToNearestBillingUnit({
		usage: existingUsage,
		billingUnits: config.billing_units ?? 1,
	});

	return {
		stripePriceId,
		quantity: roundedUsage,
		autumnPrice: price,
		autumnProduct: product,
		autumnCusEnt: cusEntWithCusProduct,
	};
};
