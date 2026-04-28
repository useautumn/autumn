import {
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
 * For `attach`: scans the customer's existing products. Throws if any are
 * managed by a non-Stripe processor — UNLESS the product being attached is a
 * true one-off (no recurring prices). True one-off attaches are safe across
 * processors because they create a parallel cus_product without replacing
 * the customer's existing subscription, and they never spin up a new Stripe
 * subscription that could conflict with an RC-managed plan.
 *
 * Recurring add-ons are NOT exempt — they create a Stripe subscription that
 * would coexist with the RC-managed main product, leading to incorrect billing.
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

	const externalCusProduct = customerProducts.find(
		(cp) => cusProductToProcessorType(cp) !== ProcessorType.Stripe,
	);

	if (externalCusProduct) {
		throw new RecaseError({
			message: `Cannot attach because the customer's current product '${externalCusProduct.product.name}' is managed by RevenueCat.`,
		});
	}
};
