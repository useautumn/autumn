import {
	type BillingContext,
	billingContextToCurrency,
	cusPriceToCusEntWithCusProduct,
	type FixedPriceConfig,
	type FullCusProduct,
	type FullCustomerPrice,
	isAllocatedPrice,
	isConsumablePrice,
	isFixedPrice,
	isPrepaidPrice,
	orgToCurrency,
	type StripeItemSpec,
	type StripeItemSpecMode,
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
	options,
}: {
	ctx: AutumnContext;
	cusPrice: FullCustomerPrice;
	cusProduct: FullCusProduct;
	billingContext?: BillingContext;
	options?: { isDuplicateProductId?: boolean };
}): StripeItemSpec | null => {
	const price = cusPrice.price;

	const orgDefault = orgToCurrency({ org: ctx.org }).toLowerCase();
	const currency = billingContext
		? billingContextToCurrency({ org: ctx.org, billingContext })
		: orgDefault;

	const buildSpec = (mode?: StripeItemSpecMode): StripeItemSpec | null => {
		// 1. Fixed / one-off price (no entitlement needed)
		if (isFixedPrice(price)) {
			const config = price.config as FixedPriceConfig;
			if ((config.amount ?? 0) <= 0) return null;

			return fixedPriceToStripeItemSpec({
				cusPrice,
				cusProduct,
				currency,
				orgDefault,
				options: { mode },
			});
		}

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
			return prepaidToStripeItemSpec({
				ctx,
				cusEntWithCusProduct,
				currency,
				orgDefault,
				options: {
					...options,
					billingVersion: billingContext?.billingVersion,
					mode,
				},
			});
		}

		// 3. Consumable (usage-in-arrear)
		if (isConsumablePrice(price)) {
			return consumableToStripeItemSpec({
				cusEntWithCusProduct,
				currency,
				orgDefault,
			});
		}

		// 4. Allocated (in-arrear prorated)
		if (isAllocatedPrice(price)) {
			return allocatedToStripeItemSpec({
				cusEntWithCusProduct,
				currency,
				orgDefault,
			});
		}

		return null;
	};

	let spec: StripeItemSpec | null;
	try {
		spec = buildSpec();
	} catch (error) {
		// Read-only rendering (verify): a fixed/prepaid price that can't render
		// its stored Stripe id is re-rendered in inline mode instead of failing.
		const canRetryInline =
			billingContext?.actionSource === "verify" &&
			(isFixedPrice(price) || isPrepaidPrice(price));
		if (!canRetryInline) throw error;
		spec = buildSpec("inline");
	}

	if (!spec) {
		return null;
	}

	// Correlate Stripe-generated invoice lines back to Autumn billing context.
	spec.metadata = {
		autumn_product_id: cusProduct.product.id,
		autumn_price_id: price.id,
		autumn_customer_price_id: cusPrice.id,
		...(spec.metadata ?? {}),
	};

	return spec;
};
