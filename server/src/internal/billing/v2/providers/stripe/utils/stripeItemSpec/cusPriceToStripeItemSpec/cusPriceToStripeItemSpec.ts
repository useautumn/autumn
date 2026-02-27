import {
	type BillingContext,
	cusPriceToCusEntWithCusProduct,
	type FullCusProduct,
	type FullCustomerPrice,
	isAllocatedPrice,
	isConsumablePrice,
	isFixedPrice,
	isPrepaidPrice,
	type StripeItemSpec,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { allocatedToStripeItemSpec } from "./allocatedToStripeItemSpec";
import { consumableToStripeItemSpec } from "./consumableToStripeItemSpec";
import { fixedPriceToStripeItemSpec } from "./fixedPriceToStripeItemSpec";
import { prepaidToStripeItemSpec } from "./prepaidToStripeItemSpec";

/**
 * Converts a single customer price to a StripeItemSpec.
 * Resolves the associated cusEnt, then dispatches to the appropriate handler.
 */
export const cusPriceToStripeItemSpec = ({
	ctx,
	cusPrice,
	cusProduct,
	billingContext,
}: {
	ctx: AutumnContext;
	cusPrice: FullCustomerPrice;
	cusProduct: FullCusProduct;
	billingContext?: BillingContext;
}): StripeItemSpec | null => {
	const price = cusPrice.price;

	let spec: StripeItemSpec | null = null;

	// 1. Fixed / one-off price (no entitlement needed)
	if (isFixedPrice(price)) {
		spec = fixedPriceToStripeItemSpec({ cusPrice, cusProduct });
	} else {
		// Resolve cusEntWithCusProduct for usage-based prices
		const cusEntWithCusProduct = cusPriceToCusEntWithCusProduct({
			cusProduct,
			cusPrice,
			cusEnts: cusProduct.customer_entitlements,
		});

		if (!cusEntWithCusProduct) {
			return null;
		}

		// 2. Prepaid (usage-in-advance)
		if (isPrepaidPrice(price)) {
			spec = prepaidToStripeItemSpec({
				ctx,
				cusEntWithCusProduct,
			});
		}

		// 3. Consumable (usage-in-arrear)
		if (isConsumablePrice(price)) {
			spec = consumableToStripeItemSpec({
				cusEntWithCusProduct,
			});
		}

		// 4. Allocated (in-arrear prorated)
		if (isAllocatedPrice(price)) {
			spec = allocatedToStripeItemSpec({ cusEntWithCusProduct });
		}
	}

	if (!spec) {
		return null;
	}

	// Attach metadata for correlating Stripe items back to Autumn prices
	spec.metadata = {
		autumn_price_id: price.id,
		autumn_customer_price_id: cusPrice.id,
	};

	return spec;
};
