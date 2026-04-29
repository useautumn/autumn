import {
	cusProductToProcessorType,
	ProcessorType,
	RecaseError,
} from "@autumn/shared";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";

export const handleExternalPSPErrors = ({
	attachParams,
	strict = false,
}: {
	attachParams: AttachParams;
	/**
	 * When true, never bypass the cross-processor guard. Use for MultiAttach
	 * where the customer's whole subscription state could change.
	 */
	strict?: boolean;
}) => {
	// Safe path: a single-product attach for a true one-off product can mix
	// across processors. One-offs create a parallel cus_product and never
	// replace an existing subscription, so a customer with an active RC sub
	// can still buy a Stripe-billed top-up (and vice versa).
	const oneOffEscape =
		!strict &&
		attachParams.products.length === 1 &&
		pricesOnlyOneOff(attachParams.prices);

	if (oneOffEscape) return;

	if (
		attachParams.customer.customer_products.some(
			(cp) => cusProductToProcessorType(cp) !== ProcessorType.Stripe,
		)
	) {
		throw new RecaseError({
			message:
				"This customer is billed outside of Stripe, please use the origin platform to manage their billing.",
		});
	}
};
