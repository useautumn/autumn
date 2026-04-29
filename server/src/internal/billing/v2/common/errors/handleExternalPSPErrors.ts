import {
	cusProductToPrices,
	cusProductToProcessorType,
	type FullCusProduct,
	type FullProduct,
	ProcessorType,
	RecaseError,
} from "@autumn/shared";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";

/**
 * Validates that we're not trying to modify (or attach alongside) a customer
 * product managed by an external PSP like RevenueCat.
 *
 * For `update`: validates the specific cusProduct being modified.
 *
 * For `attach`: scans the customer's existing products. Throws if any
 * RECURRING product is managed by a non-Stripe processor — UNLESS the product
 * being attached is itself a true one-off (no recurring prices). One-off
 * cross-processor purchases (in either direction) are safe: they create a
 * parallel cus_product, never spin up or reuse a recurring Stripe subscription,
 * and so cannot conflict with the existing external subscription.
 *
 * Concretely:
 *   - external recurring + attaching anything → throw (would create / mutate
 *     a Stripe sub that coexists or collides with the external sub).
 *   - external recurring + attaching one-off  → bypass (parallel one-off only).
 *   - external one-off only + attaching anything → bypass (no external sub
 *     exists to conflict with).
 */
export const handleExternalPSPErrors = ({
	customerProduct,
	customerProducts,
	attachProduct,
	action,
}: {
	/** For `update`: the specific customer product being modified. */
	customerProduct?: FullCusProduct;
	/** For `attach`: all of the customer's current products. */
	customerProducts?: FullCusProduct[];
	/** For `attach`: the product being attached. */
	attachProduct?: FullProduct;
	action: "attach" | "update";
}) => {
	if (action === "update") {
		if (!customerProduct) return;

		const processorType = cusProductToProcessorType(customerProduct);
		if (processorType === ProcessorType.RevenueCat) {
			throw new RecaseError({
				message: `Cannot update '${customerProduct.product.name}' because it is managed by RevenueCat.`,
			});
		}
		return;
	}

	// action === "attach"
	if (!customerProducts || customerProducts.length === 0) return;

	// Safe path: a true one-off attach (no recurring prices) can mix across
	// processors. One-offs create a parallel cus_product and never spin up a
	// recurring Stripe subscription, so a customer with an active RC sub can
	// still buy a Stripe-billed top-up. Recurring add-ons take the strict path.
	if (attachProduct && pricesOnlyOneOff(attachProduct.prices)) {
		return;
	}

	// Only block on EXTERNAL RECURRING products. External one-off-only products
	// (e.g. a previously-purchased RC one-off pack) don't have a recurring
	// subscription and so can't conflict with the new Stripe attach.
	const conflictingExternalCusProduct = customerProducts.find((cp) => {
		const isExternal =
			cusProductToProcessorType(cp) !== ProcessorType.Stripe;
		if (!isExternal) return false;

		// Skip external products that are pure one-offs — they have no
		// recurring sub to conflict with. Prices live on customer_prices
		// (FullCusProduct.product is the bare Product without prices).
		const cpPrices = cusProductToPrices({ cusProduct: cp });
		const cpIsOneOffOnly = pricesOnlyOneOff(cpPrices);
		return !cpIsOneOffOnly;
	});

	if (conflictingExternalCusProduct) {
		throw new RecaseError({
			message: `Cannot attach because the customer's current product '${conflictingExternalCusProduct.product.name}' is managed by RevenueCat.`,
		});
	}
};
