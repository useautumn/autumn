import {
	cusEntsToAllowance,
	cusEntToBillingObjects,
	ErrCode,
	type FullCusEntWithFullCusProduct,
	getPriceCurrencyStripeId,
	InternalError,
	roundUsageToNearestBillingUnit,
	type StripeItemSpec,
	type UsagePriceConfig,
} from "@autumn/shared";
import { cusEntToInvoiceUsage } from "@shared/utils/cusEntUtils/overageUtils/cusEntToInvoiceUsage";
import { allocatedUsageToStripeUsage } from "@shared/utils/productUtils/priceUtils/convertPrice/allocatedUsageToStripeUsage";

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
			code: ErrCode.StripePriceNotLinked,
		});
	}

	const existingUsage = allocatedUsageToStripeUsage({
		price,
		usage: cusEntToInvoiceUsage({
			cusEnt: cusEntWithCusProduct,
			subtractReplaceables: true,
		}),
		allowance: cusEntsToAllowance({ cusEnts: [cusEntWithCusProduct] }),
	});

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
