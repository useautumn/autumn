import {
	cusEntToBillingObjects,
	type FullCusEntWithFullCusProduct,
	InternalError,
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

	if (!config.stripe_price_id) {
		throw new InternalError({
			message: `[allocatedToStripeItemSpec] config.stripe_price_id is empty for autumn price: ${price.id}`,
		});
	}

	const existingUsage = cusEntToInvoiceUsage({ cusEnt: cusEntWithCusProduct });

	return {
		stripePriceId: config.stripe_price_id,
		quantity: existingUsage,
		autumnPrice: price,
		autumnProduct: product,
		autumnCusEnt: cusEntWithCusProduct,
	};
};
