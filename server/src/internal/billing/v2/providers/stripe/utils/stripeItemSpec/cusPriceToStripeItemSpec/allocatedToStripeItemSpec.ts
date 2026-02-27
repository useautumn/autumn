import {
	cusEntToBillingObjects,
	type FullCusEntWithFullCusProduct,
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
}: {
	cusEntWithCusProduct: FullCusEntWithFullCusProduct;
}): StripeItemSpec | null => {
	const billing = cusEntToBillingObjects({ cusEnt: cusEntWithCusProduct });
	if (!billing) return null;

	const { price, product } = billing;
	const config = price.config as UsagePriceConfig;

	const existingUsage = cusEntToInvoiceUsage({ cusEnt: cusEntWithCusProduct });

	return {
		stripePriceId: config.stripe_price_id!,
		quantity: existingUsage,
		autumnPrice: price,
		autumnProduct: product,
		autumnCusEnt: cusEntWithCusProduct,
	};
};
