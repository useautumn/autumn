import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const hasUsableTaxAddress = (address?: Stripe.Address | null) => {
	return Boolean(address?.country);
};

const customerHasUsableTaxLocation = (stripeCustomer?: Stripe.Customer) => {
	if (!stripeCustomer) return true;

	if (stripeCustomer.tax?.automatic_tax) {
		return ["supported", "not_collecting"].includes(
			stripeCustomer.tax.automatic_tax,
		);
	}

	return (
		hasUsableTaxAddress(stripeCustomer.address) ||
		hasUsableTaxAddress(stripeCustomer.shipping?.address)
	);
};

export const shouldEnableStripeAutomaticTax = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}) => {
	if (!ctx.org.config.automatic_tax) return false;

	// Invoice mode uses send_invoice and has no address collection UI.
	if (billingContext.invoiceMode) return false;

	// Use only the already-fetched Stripe customer. If setup did not fetch one,
	// do not fetch again on the write path.
	if (!customerHasUsableTaxLocation(billingContext.stripeCustomer)) {
		return false;
	}

	return true;
};
