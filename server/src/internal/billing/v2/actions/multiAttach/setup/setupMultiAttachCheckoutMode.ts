import type { CheckoutMode, RedirectMode } from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Determines checkout mode for multi-attach operations.
 *
 * Simplified logic (no autumn_checkout):
 * - redirect_mode "never" → null
 * - has payment method + "always" → stripe_checkout
 * - has payment method + "if_required" → null
 * - no payment method → stripe_checkout
 */
export const setupMultiAttachCheckoutMode = ({
	paymentMethod,
	redirectMode,
}: {
	paymentMethod?: Stripe.PaymentMethod;
	redirectMode?: RedirectMode;
}): CheckoutMode => {
	if (redirectMode === "never") {
		return null;
	}

	if (paymentMethod) {
		return redirectMode === "always" ? "stripe_checkout" : null;
	}

	return "stripe_checkout";
};
